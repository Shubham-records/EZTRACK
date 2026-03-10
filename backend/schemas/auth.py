from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    message: str
    eztracker_jwt_access_control_token: str
    eztracker_jwt_databaseName_control_token: str
    refresh_token: str


class SignupRequest(BaseModel):
    username: str
    password: str
    GYMNAME: str
    EMAILID: str


class TokenData(BaseModel):
    gymId: str | None = None
    username: str | None = None


class RefreshRequest(BaseModel):
    refresh_token: str


class StaffLoginRequest(BaseModel):
    """Staff login credentials."""
    gym_id: str
    username: str
    password: str

