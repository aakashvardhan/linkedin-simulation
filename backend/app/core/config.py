from functools import lru_cache
from urllib.parse import quote_plus

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8', extra='ignore')

    app_name: str = Field(default='LinkedIn Simulation M3/M4 Backend', alias='APP_NAME')
    app_host: str = Field(default='0.0.0.0', alias='APP_HOST')
    app_port: int = Field(default=8000, alias='APP_PORT')
    debug: bool = Field(default=True, alias='DEBUG')
    auto_create_schema: bool = Field(default=True, alias='AUTO_CREATE_SCHEMA')

    mysql_host: str = Field(default='localhost', alias='MYSQL_HOST')
    mysql_port: int = Field(default=3306, alias='MYSQL_PORT')
    mysql_db: str = Field(default='linkedin_simulation', alias='MYSQL_DB')
    mysql_user: str = Field(default='root', alias='MYSQL_USER')
    mysql_password: str = Field(default='', alias='MYSQL_PASSWORD')

    mongo_uri: str = Field(default='mongodb://localhost:27017', alias='MONGO_URI')
    mongo_db: str = Field(default='linkedin_simulation', alias='MONGO_DB')

    cors_origins: str = Field(
        default='',
        alias='CORS_ORIGINS',
        description='Comma-separated browser origins for CORS. If empty, local dev defaults apply.',
    )

    redis_url: str = Field(default='redis://127.0.0.1:6379/0', alias='REDIS_URL')

    enable_kafka: bool = Field(default=True, alias='ENABLE_KAFKA')
    kafka_bootstrap_servers: str = Field(default='localhost:9092', alias='KAFKA_BOOTSTRAP_SERVERS')
    kafka_client_id: str = Field(default='linkedin-m3m4-backend', alias='KAFKA_CLIENT_ID')
    kafka_consumer_group: str = Field(default='linkedin-events-consumer', alias='KAFKA_CONSUMER_GROUP')

    jwt_secret: str = Field(default='change-me-in-env', alias='JWT_SECRET')
    jwt_algorithm: str = Field(default='HS256', alias='JWT_ALGORITHM')
    access_token_expire_minutes: int = Field(default=1440, alias='ACCESS_TOKEN_EXPIRE_MINUTES')

    @property
    def mysql_url(self) -> str:
        safe_password = quote_plus(self.mysql_password)
        return (
            f'mysql+pymysql://{self.mysql_user}:{safe_password}'
            f'@{self.mysql_host}:{self.mysql_port}/{self.mysql_db}'
        )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
