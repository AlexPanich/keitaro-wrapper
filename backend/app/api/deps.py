from collections.abc import AsyncIterator

from app.services.keitaro import KeitaroClient


async def get_keitaro() -> AsyncIterator[KeitaroClient]:
    client = KeitaroClient()
    try:
        yield client
    finally:
        await client.close()
