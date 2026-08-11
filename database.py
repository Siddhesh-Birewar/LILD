import os
import json
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")


def get_db_connection():
    return psycopg2.connect(DATABASE_URL, connect_timeout=10)


# ═══════════════════════════════════════
#  SCHEMA INITIALIZATION
# ═══════════════════════════════════════

def init_db():
    """Initializes the database with users, sessions, and question_results tables."""
    conn = get_db_connection()
    cur = conn.cursor()

    create_users_sql = """
    CREATE TABLE IF NOT EXISTS users (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        name text NOT NULL,
        roll text NOT NULL,
        email text NOT NULL UNIQUE,
        branch text,
        sem text,
        dob text,
        created_at timestamptz DEFAULT now()
    );
    """

    create_sessions_sql = """
    CREATE TABLE IF NOT EXISTS sessions (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id uuid REFERENCES users(id) ON DELETE CASCADE,
        session_number int DEFAULT 1,
        score int DEFAULT 0,
        total_marks int DEFAULT 0,
        questions_solved int DEFAULT 0,
        li_ld_result text DEFAULT '—',
        rank_correct bool DEFAULT false,
        type_correct bool DEFAULT false,
        relation_correct bool DEFAULT false,
        completed bool DEFAULT false,
        started_at timestamptz DEFAULT now(),
        ended_at timestamptz,
        vectors jsonb,
        matrix jsonb
    );
    """

    create_question_results_sql = """
    CREATE TABLE IF NOT EXISTS question_results (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        session_id uuid REFERENCES sessions(id) ON DELETE CASCADE,
        user_id uuid REFERENCES users(id) ON DELETE CASCADE,
        question_number int DEFAULT 1,
        vectors jsonb,
        matrix jsonb,
        correct_rank int,
        user_rank int,
        rank_correct bool DEFAULT false,
        li_ld_result text,
        user_type_answer text,
        type_correct bool DEFAULT false,
        relation_input text,
        relation_correct bool DEFAULT false,
        score int DEFAULT 0,
        total_marks int DEFAULT 0,
        created_at timestamptz DEFAULT now()
    );
    """

    try:
        cur.execute(create_users_sql)
        cur.execute(create_sessions_sql)
        cur.execute(create_question_results_sql)
        conn.commit()
        print("✅ Database initialized successfully (users + sessions + question_results tables).")
    except Exception as e:
        print(f"❌ Database initialization failed: {e}")
    finally:
        cur.close()
        conn.close()


# ═══════════════════════════════════════
#  USER OPERATIONS
# ═══════════════════════════════════════

def find_user_by_email(email):
    """Find a user by their email address. Returns user dict or None."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM users WHERE email = %s", (email,))
        row = cur.fetchone()
        return dict(row) if row else None
    finally:
        cur.close()
        conn.close()


def create_user(data):
    """Insert a new user. Returns the new user's id."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    query = """
    INSERT INTO users (name, roll, email, branch, sem, dob)
    VALUES (%(name)s, %(roll)s, %(email)s, %(branch)s, %(sem)s, %(dob)s)
    RETURNING id;
    """
    try:
        cur.execute(query, data)
        user_id = cur.fetchone()['id']
        conn.commit()
        return user_id
    finally:
        cur.close()
        conn.close()


def get_all_users():
    """Get all users ordered by creation date."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM users ORDER BY created_at DESC")
        return [dict(r) for r in cur.fetchall()]
    finally:
        cur.close()
        conn.close()


# ═══════════════════════════════════════
#  SESSION OPERATIONS
# ═══════════════════════════════════════

def create_session(user_id, session_number):
    """Create a new session for a user. Returns the session id."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    query = """
    INSERT INTO sessions (user_id, session_number)
    VALUES (%s, %s)
    RETURNING id;
    """
    try:
        cur.execute(query, (str(user_id), session_number))
        session_id = cur.fetchone()['id']
        conn.commit()
        return session_id
    finally:
        cur.close()
        conn.close()


def update_session(session_id, data):
    """Update fields on a session row. `data` is a dict of column: value."""
    conn = get_db_connection()
    cur = conn.cursor()

    # Dynamically build the SET clause
    fields = [f"{k} = %({k})s" for k in data.keys()]
    query = f"UPDATE sessions SET {', '.join(fields)} WHERE id = %(id)s"

    try:
        data['id'] = str(session_id)
        cur.execute(query, data)
        conn.commit()
    finally:
        cur.close()
        conn.close()


def end_session(session_id):
    """Mark a session as completed and set ended_at timestamp."""
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            "UPDATE sessions SET completed = true, ended_at = now() WHERE id = %s",
            (str(session_id),)
        )
        conn.commit()
    finally:
        cur.close()
        conn.close()


def get_user_sessions(user_id):
    """Get all sessions for a specific user, ordered by started_at."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "SELECT * FROM sessions WHERE user_id = %s ORDER BY started_at ASC",
            (str(user_id),)
        )
        return [dict(r) for r in cur.fetchall()]
    finally:
        cur.close()
        conn.close()


def get_user_session_count(user_id):
    """Get the number of sessions a user has."""
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            "SELECT COUNT(*) FROM sessions WHERE user_id = %s",
            (str(user_id),)
        )
        return cur.fetchone()[0]
    finally:
        cur.close()
        conn.close()


# ═══════════════════════════════════════
#  QUESTION RESULTS OPERATIONS
# ═══════════════════════════════════════

def save_question_result(data):
    """Save a single question result. Returns the question result id."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    # Serialize JSON fields
    if 'vectors' in data and isinstance(data['vectors'], (list, dict)):
        data['vectors'] = json.dumps(data['vectors'])
    if 'matrix' in data and isinstance(data['matrix'], (list, dict)):
        data['matrix'] = json.dumps(data['matrix'])

    query = """
    INSERT INTO question_results (
        session_id, user_id, question_number, vectors, matrix,
        correct_rank, user_rank, rank_correct,
        li_ld_result, user_type_answer, type_correct,
        relation_input, relation_correct,
        score, total_marks
    ) VALUES (
        %(session_id)s, %(user_id)s, %(question_number)s, %(vectors)s, %(matrix)s,
        %(correct_rank)s, %(user_rank)s, %(rank_correct)s,
        %(li_ld_result)s, %(user_type_answer)s, %(type_correct)s,
        %(relation_input)s, %(relation_correct)s,
        %(score)s, %(total_marks)s
    ) RETURNING id;
    """
    try:
        cur.execute(query, data)
        qid = cur.fetchone()['id']
        conn.commit()
        return qid
    finally:
        cur.close()
        conn.close()


def get_session_questions(session_id):
    """Get all question results for a specific session."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "SELECT * FROM question_results WHERE session_id = %s ORDER BY question_number ASC",
            (str(session_id),)
        )
        return [dict(r) for r in cur.fetchall()]
    finally:
        cur.close()
        conn.close()


def get_user_questions(user_id):
    """Get all question results for a specific user across all sessions."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            """SELECT qr.*, s.session_number
               FROM question_results qr
               JOIN sessions s ON s.id = qr.session_id
               WHERE qr.user_id = %s
               ORDER BY qr.created_at ASC""",
            (str(user_id),)
        )
        return [dict(r) for r in cur.fetchall()]
    finally:
        cur.close()
        conn.close()


def get_all_questions_for_admin():
    """Get all question results across all users (joined with user info)."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            """SELECT qr.*, u.name, u.roll, u.email, s.session_number
               FROM question_results qr
               JOIN users u ON u.id = qr.user_id
               JOIN sessions s ON s.id = qr.session_id
               ORDER BY qr.created_at DESC"""
        )
        return [dict(r) for r in cur.fetchall()]
    finally:
        cur.close()
        conn.close()


# ═══════════════════════════════════════
#  ADMIN: AGGREGATED QUERIES
# ═══════════════════════════════════════

def get_all_users_with_stats():
    """Get all users with aggregated session statistics."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    query = """
    SELECT
        u.id, u.name, u.roll, u.email, u.branch, u.sem, u.dob, u.created_at,
        COUNT(s.id) AS total_sessions,
        COALESCE(SUM(s.questions_solved), 0) AS total_questions,
        COALESCE(SUM(s.score), 0) AS total_score,
        COALESCE(SUM(s.total_marks), 0) AS total_possible,
        CASE WHEN SUM(s.total_marks) > 0
             THEN ROUND(SUM(s.score)::numeric / SUM(s.total_marks) * 100, 1)
             ELSE 0 END AS avg_percentage,
        MAX(CASE WHEN s.total_marks > 0
                 THEN ROUND(s.score::numeric / s.total_marks * 100, 1)
                 ELSE 0 END) AS best_percentage,
        COUNT(s.id) FILTER (WHERE s.completed = true) AS completed_sessions
    FROM users u
    LEFT JOIN sessions s ON s.user_id = u.id
    GROUP BY u.id
    ORDER BY u.created_at DESC;
    """
    try:
        cur.execute(query)
        return [dict(r) for r in cur.fetchall()]
    finally:
        cur.close()
        conn.close()


def get_all_sessions_filtered(user_id=None, date_from=None, date_to=None):
    """Get all sessions with optional filters. Returns sessions joined with user name/roll."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    query = """
    SELECT s.*, u.name, u.roll, u.email, u.branch, u.sem
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE 1=1
    """
    params = {}

    if user_id:
        query += " AND s.user_id = %(user_id)s"
        params['user_id'] = str(user_id)
    if date_from:
        query += " AND s.started_at >= %(date_from)s"
        params['date_from'] = date_from
    if date_to:
        query += " AND s.started_at <= %(date_to)s"
        params['date_to'] = date_to

    query += " ORDER BY s.started_at DESC"

    try:
        cur.execute(query, params)
        return [dict(r) for r in cur.fetchall()]
    finally:
        cur.close()
        conn.close()


def get_platform_stats():
    """Get aggregated platform-wide statistics for admin dashboard."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    query = """
    SELECT
        (SELECT COUNT(*) FROM users) AS total_users,
        (SELECT COUNT(*) FROM sessions) AS total_sessions,
        (SELECT COUNT(*) FROM sessions WHERE completed = true) AS completed_sessions,
        (SELECT COALESCE(SUM(questions_solved), 0) FROM sessions) AS total_questions,
        CASE WHEN (SELECT SUM(total_marks) FROM sessions) > 0
             THEN ROUND((SELECT SUM(score)::numeric FROM sessions) /
                          (SELECT SUM(total_marks)::numeric FROM sessions) * 100, 1)
             ELSE 0 END AS avg_score_pct,
        (SELECT u.name FROM users u
         JOIN sessions s ON s.user_id = u.id
         WHERE s.total_marks > 0
         GROUP BY u.id, u.name
         ORDER BY SUM(s.score)::numeric / SUM(s.total_marks) * 100 DESC
         LIMIT 1) AS top_performer
    ;
    """
    try:
        cur.execute(query)
        row = cur.fetchone()
        return dict(row) if row else {}
    finally:
        cur.close()
        conn.close()


# ═══════════════════════════════════════
#  ADMIN: DESTRUCTIVE OPERATIONS
# ═══════════════════════════════════════

def delete_all_data():
    """Delete all question_results, sessions, and users. Use with caution."""
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM question_results")
        cur.execute("DELETE FROM sessions")
        cur.execute("DELETE FROM users")
        conn.commit()
    finally:
        cur.close()
        conn.close()


# ═══════════════════════════════════════
#  LEGACY COMPAT (kept for old students table)
# ═══════════════════════════════════════

def insert_student(data):
    """Legacy: insert into students table (kept for backward compat)."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    query = """
    INSERT INTO students (name, roll, email, branch, sem, dob, score, total_marks, li_ld_result, rank_correct, type_correct, relation_correct, completed, login_time)
    VALUES (%(name)s, %(roll)s, %(email)s, %(branch)s, %(sem)s, %(dob)s, %(score)s, %(total_marks)s, %(li_ld_result)s, %(rank_correct)s, %(type_correct)s, %(relation_correct)s, %(completed)s, %(login_time)s)
    RETURNING id;
    """
    try:
        cur.execute(query, data)
        student_id = cur.fetchone()['id']
        conn.commit()
        return student_id
    finally:
        cur.close()
        conn.close()


def get_all_students():
    """Legacy: get all from students table."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM students ORDER BY login_time DESC")
        return [dict(r) for r in cur.fetchall()]
    finally:
        cur.close()
        conn.close()
