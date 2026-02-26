"""
core/storage.py — Object Storage Abstraction
=============================================
Supports Supabase Storage (now) and Cloudflare R2 / AWS S3 (later).
Switching backends = only .env changes. Zero router code changes required.

All images are stored in a PRIVATE bucket.
Access is via short-lived signed URLs (configurable expiry, default 1 hour).

Setup
-----
Install:
    pip install boto3

.env (Supabase — current):
    STORAGE_BACKEND=supabase
    STORAGE_ENDPOINT_URL=https://<project-ref>.supabase.co/storage/v1/s3
    STORAGE_ACCESS_KEY=<supabase-s3-access-key>
    STORAGE_SECRET_KEY=<supabase-s3-secret-key>
    STORAGE_BUCKET=eztrack
    STORAGE_REGION=ap-south-1
    STORAGE_SIGNED_URL_EXPIRY=3600

    How to get Supabase S3 credentials:
    Dashboard → Project Settings → Storage → S3 Connection

.env (Cloudflare R2 — future swap):
    STORAGE_BACKEND=r2
    STORAGE_ENDPOINT_URL=https://<account-id>.r2.cloudflarestorage.com
    STORAGE_ACCESS_KEY=<r2-access-key-id>
    STORAGE_SECRET_KEY=<r2-secret-access-key>
    STORAGE_BUCKET=eztrack
    STORAGE_REGION=auto
    STORAGE_SIGNED_URL_EXPIRY=3600

.env (AWS S3 — alternative):
    STORAGE_BACKEND=s3
    STORAGE_ENDPOINT_URL=https://s3.ap-south-1.amazonaws.com
    STORAGE_ACCESS_KEY=<aws-access-key-id>
    STORAGE_SECRET_KEY=<aws-secret-access-key>
    STORAGE_BUCKET=eztrack-prod
    STORAGE_REGION=ap-south-1
    STORAGE_SIGNED_URL_EXPIRY=3600

Folder structure in bucket:
    members/<uuid>       — member profile photos
    proteins/<uuid>      — protein product images
    logos/<uuid>         — branch / gym logos
    receipts/<uuid>      — expense receipt images
    contacts/<uuid>      — external contact photos (optional)
"""

import os
import uuid
import logging
from typing import Optional

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from fastapi import HTTPException

logger = logging.getLogger(__name__)

# ─── Configuration ────────────────────────────────────────────────────────────

STORAGE_BACKEND      = os.getenv("STORAGE_BACKEND", "supabase")
STORAGE_ENDPOINT_URL = os.getenv("STORAGE_ENDPOINT_URL")
STORAGE_ACCESS_KEY   = os.getenv("STORAGE_ACCESS_KEY")
STORAGE_SECRET_KEY   = os.getenv("STORAGE_SECRET_KEY")
STORAGE_BUCKET       = os.getenv("STORAGE_BUCKET", "eztrack")
STORAGE_REGION       = os.getenv("STORAGE_REGION", "ap-south-1")
STORAGE_SIGNED_URL_EXPIRY = int(os.getenv("STORAGE_SIGNED_URL_EXPIRY", "3600"))  # seconds

# Allowed image MIME types
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB hard cap


# ─── S3 Client (shared across all backends) ───────────────────────────────────

def _get_client():
    """
    Returns a boto3 S3 client configured for the active backend.
    Supabase Storage, Cloudflare R2, and AWS S3 all speak S3-compatible API.
    """
    if not STORAGE_ENDPOINT_URL:
        raise RuntimeError(
            "STORAGE_ENDPOINT_URL is not set. "
            "Configure object storage in your .env file."
        )
    return boto3.client(
        "s3",
        endpoint_url=STORAGE_ENDPOINT_URL,
        aws_access_key_id=STORAGE_ACCESS_KEY,
        aws_secret_access_key=STORAGE_SECRET_KEY,
        region_name=STORAGE_REGION,
        config=Config(signature_version="s3v4"),
    )


# ─── Public API ───────────────────────────────────────────────────────────────

def upload_image(
    data: bytes,
    folder: str,
    mime_type: str,
    filename_override: Optional[str] = None,
) -> str:
    """
    Upload image bytes to object storage.

    Args:
        data:              Raw image bytes.
        folder:            Destination folder in bucket (e.g. 'members', 'logos').
        mime_type:         MIME type string (e.g. 'image/jpeg').
        filename_override: Optional custom filename. Defaults to a UUID.

    Returns:
        Storage key (e.g. 'members/abc-123').  NOT a URL.
        Use get_signed_url(key) to generate an access URL.

    Raises:
        HTTPException 400 — unsupported MIME type or file too large.
        HTTPException 500 — upload failed.
    """
    if mime_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{mime_type}'. Allowed: jpeg, png, webp.",
        )
    if len(data) > MAX_IMAGE_SIZE_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"File too large ({len(data) // 1024} KB). Maximum allowed: 5 MB.",
        )

    filename = filename_override or str(uuid.uuid4())
    key = f"{folder}/{filename}"

    try:
        _get_client().put_object(
            Bucket=STORAGE_BUCKET,
            Key=key,
            Body=data,
            ContentType=mime_type,
        )
        logger.info("Uploaded %s bytes to %s/%s", len(data), STORAGE_BUCKET, key)
        return key
    except ClientError as e:
        logger.error("Storage upload failed: %s", e)
        raise HTTPException(status_code=500, detail="Image upload failed. Please try again.")


def get_signed_url(storage_key: str, expiry_seconds: int = STORAGE_SIGNED_URL_EXPIRY) -> str:
    """
    Generate a short-lived pre-signed URL for a private object.

    Args:
        storage_key:    The key returned by upload_image (e.g. 'members/abc-123').
        expiry_seconds: URL validity window. Default from env (1 hour).

    Returns:
        Pre-signed HTTPS URL valid for expiry_seconds.

    Raises:
        HTTPException 404 — object does not exist in bucket.
        HTTPException 500 — URL generation failed.
    """
    try:
        url = _get_client().generate_presigned_url(
            "get_object",
            Params={"Bucket": STORAGE_BUCKET, "Key": storage_key},
            ExpiresIn=expiry_seconds,
        )
        return url
    except ClientError as e:
        error_code = e.response.get("Error", {}).get("Code", "")
        if error_code == "NoSuchKey":
            raise HTTPException(status_code=404, detail="Image not found in storage.")
        logger.error("Signed URL generation failed: %s", e)
        raise HTTPException(status_code=500, detail="Could not generate image URL.")


def delete_image(storage_key: str) -> None:
    """
    Delete an object from storage by its key.
    Silently succeeds if the object does not exist (idempotent).

    Args:
        storage_key: The key returned by upload_image.
    """
    if not storage_key:
        return
    try:
        _get_client().delete_object(Bucket=STORAGE_BUCKET, Key=storage_key)
        logger.info("Deleted %s from %s", storage_key, STORAGE_BUCKET)
    except ClientError as e:
        # Log but don't raise — a missing file during delete is not fatal
        logger.warning("Storage delete warning for key %s: %s", storage_key, e)


def get_signed_url_or_none(storage_key: Optional[str]) -> Optional[str]:
    """
    Convenience wrapper — returns None if storage_key is empty/None.
    Use this in list/detail response mappers where the image is optional.

    Example:
        response["imageUrl"] = get_signed_url_or_none(member.imageUrl)
    """
    if not storage_key:
        return None
    try:
        return get_signed_url(storage_key)
    except HTTPException:
        return None


# ─── Folder Constants (import these in routers) ───────────────────────────────

class StorageFolder:
    MEMBERS  = "members"
    PROTEINS = "proteins"
    LOGOS    = "logos"
    RECEIPTS = "receipts"
    CONTACTS = "contacts"
