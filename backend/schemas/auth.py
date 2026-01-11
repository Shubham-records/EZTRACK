from pydantic import BaseModel

class LoginRequest(BaseModel):
    username: str
    password: str

class LoginResponse(BaseModel):
    message: str
    eztracker_jwt_access_control_token: str
    eztracker_jwt_databaseName_control_token: str

class TokenData(BaseModel):
    gymId: str | None = None
    username: str | None = None
