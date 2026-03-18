#!/usr/bin/env python3
"""
Script to create or refresh RHYTHMIQ admin users.
Usage: python create_admin_users.py
"""
import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

import bcrypt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

sys.path.insert(0, str(Path(__file__).parent))

from models import AdminRecommendation, Base, User

DATABASE_URL = os.environ.get('DATABASE_URL', 'sqlite+aiosqlite:///./rhythmiq.db')
engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    future=True,
    pool_pre_ping=True,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {},
)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')


def password_matches(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode('utf-8'), password_hash.encode('utf-8'))
    except ValueError:
        return False


async def create_admin_users():
    admin_users = [
        {
            "username": "Devangipradhan",
            "email": "devangipradhan@rhythmiq.com",
            "password": "rhythmiq@2026",
        },
        {
            "username": "Shruthishirgaonkar",
            "email": "shruthishirgaonkar@rhythmiq.com",
            "password": "rhythmiq@2026",
        },
    ]

    async with AsyncSessionLocal() as db:
        for admin in admin_users:
            result = await db.execute(select(User).where(User.email == admin["email"]))
            existing_user = result.scalar_one_or_none()

            if existing_user:
                updated = False
                if existing_user.username != admin["username"]:
                    existing_user.username = admin["username"]
                    updated = True
                if not password_matches(admin["password"], existing_user.password_hash):
                    existing_user.password_hash = hash_password(admin["password"])
                    updated = True

                if updated:
                    await db.commit()
                    print(f"[updated] {admin['email']}")
                else:
                    print(f"[unchanged] {admin['email']}")
                continue

            new_user = User(
                id=str(uuid.uuid4()),
                username=admin["username"],
                email=admin["email"],
                password_hash=hash_password(admin["password"]),
                created_at=datetime.now(timezone.utc),
            )
            db.add(new_user)
            await db.commit()
            print(f"[created] {admin['email']} / password: {admin['password']}")


async def main():
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        print("=" * 60)
        print("RHYTHMIQ Admin User Creator")
        print("=" * 60)
        await create_admin_users()
        print("=" * 60)
        print("Admin users ready")
        print("Admin Portal: http://localhost:3001/admin/login")
        print("Dashboard: http://localhost:3001/admin")
        print("=" * 60)
    except Exception as exc:
        print(f"Error: {exc}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
