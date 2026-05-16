from starlette.middleware.cors import CORSMiddleware

from api.app.core.config import get_settings
from api.app.main import create_app


def test_cors_origins_are_configured_as_parsed_list():
    app = create_app()
    cors_middleware = next(
        middleware
        for middleware in app.user_middleware
        if middleware.cls is CORSMiddleware
    )

    assert cors_middleware.kwargs["allow_origins"] == get_settings().cors_origins_list
    assert isinstance(cors_middleware.kwargs["allow_origins"], list)
