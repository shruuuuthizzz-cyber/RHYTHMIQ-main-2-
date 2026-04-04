import os
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

load_dotenv(Path(__file__).parent / '.env.local')
load_dotenv(Path(__file__).parent / '.env')

DATABASE_URL = os.environ.get('DATABASE_URL')

# Default to a local SQLite database for easy local development.
# Alembic uses a synchronous engine, so use the sync sqlite URL here.
if not DATABASE_URL:
    if os.environ.get("RENDER") == "true":
        DATABASE_URL = "sqlite:////var/data/rhythmiq.db"
    else:
        DATABASE_URL = f"sqlite:///{Path(__file__).parent / 'rhythmiq.db'}"

# Keep local SQLite paths stable regardless of the shell's current directory.
if DATABASE_URL.startswith('sqlite:///./'):
    sqlite_path = Path(__file__).parent / DATABASE_URL.replace('sqlite:///./', '', 1)
    DATABASE_URL = f"sqlite:///{sqlite_path.as_posix()}"

# Convert to an async URL for SQLAlchemy async engine where needed.
if DATABASE_URL.startswith('postgresql://'):
    ASYNC_DATABASE_URL = DATABASE_URL.replace('postgresql://', 'postgresql+asyncpg://')
elif DATABASE_URL.startswith('sqlite://') and not DATABASE_URL.startswith('sqlite+aiosqlite://'):
    ASYNC_DATABASE_URL = DATABASE_URL.replace('sqlite://', 'sqlite+aiosqlite://', 1)
else:
    ASYNC_DATABASE_URL = DATABASE_URL

engine_kwargs = {"echo": False}

if ASYNC_DATABASE_URL.startswith('postgresql+asyncpg://'):
    engine_kwargs.update(
        pool_size=10,
        max_overflow=5,
        pool_timeout=30,
        pool_recycle=1800,
        pool_pre_ping=False,
        connect_args={
            "statement_cache_size": 0,
            "command_timeout": 30,
        }
    )
elif ASYNC_DATABASE_URL.startswith('sqlite+aiosqlite://'):
    engine_kwargs.update(connect_args={})

engine = create_async_engine(ASYNC_DATABASE_URL, **engine_kwargs)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)

class Base(DeclarativeBase):
    pass

async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
