import psycopg2
from dotenv import load_dotenv
import os

# Load environment variables from .env
load_dotenv()

# Fetch variables
DATABASE_URL = os.getenv("DATABASE_URL")

# Connect to the database
try:
    connection = psycopg2.connect(DATABASE_URL, connect_timeout=10)
    print("✅ Successfully connected to Supabase PostgreSQL!")
except Exception as e:
    print(f"❌ Connection failed: {e}")
