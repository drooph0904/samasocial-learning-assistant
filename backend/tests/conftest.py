import os

# Provide dummy settings so app.config.Settings can instantiate during tests.
# Real OpenAI/Supabase calls are always mocked in the test suite.
os.environ.setdefault("OPENAI_API_KEY", "test-key")
os.environ.setdefault("SUPABASE_URL", "http://localhost")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-service-key")
