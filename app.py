import os
import json
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
import database

load_dotenv()

app = Flask(__name__)

# Initialize DB on start
database.init_db()


@app.route('/')
def index():
    return render_template('index.html')


# ═══════════════════════════════════════
#  AUTH & USER LOOKUP
# ═══════════════════════════════════════

@app.route('/api/login', methods=['POST'])
def login():
    """
    Check if user exists by email.
    - If exists: return user info + session history (returning user).
    - If new: create user, return fresh user info.
    """
    data = request.json
    email = data.get('email', '').strip()

    if not email:
        return jsonify({'status': 'error', 'message': 'Email is required'}), 400

    try:
        existing_user = database.find_user_by_email(email)

        if existing_user:
            # Returning user — fetch their session history
            user_id = existing_user['id']
            sessions = database.get_user_sessions(user_id)

            # Serialize for JSON
            user_data = _serialize_user(existing_user)
            sessions_data = [_serialize_session(s) for s in sessions]

            return jsonify({
                'status': 'returning',
                'user': user_data,
                'sessions': sessions_data
            })
        else:
            # New user — create them
            user_id = database.create_user({
                'name': data.get('name', ''),
                'roll': data.get('roll', ''),
                'email': email,
                'branch': data.get('branch', ''),
                'sem': data.get('sem', ''),
                'dob': data.get('dob', ''),
            })
            return jsonify({
                'status': 'new',
                'user': {
                    'id': str(user_id),
                    'name': data.get('name', ''),
                    'roll': data.get('roll', ''),
                    'email': email,
                    'branch': data.get('branch', ''),
                    'sem': data.get('sem', ''),
                },
                'sessions': []
            })

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ═══════════════════════════════════════
#  SESSION MANAGEMENT
# ═══════════════════════════════════════

@app.route('/api/session/start', methods=['POST'])
def start_session():
    """
    Create a new session for a user.
    Body: { user_id, mode: "continue" | "fresh" }
    """
    data = request.json
    user_id = data.get('user_id')
    mode = data.get('mode', 'fresh')  # "continue" or "fresh"

    if not user_id:
        return jsonify({'status': 'error', 'message': 'user_id is required'}), 400

    try:
        session_count = database.get_user_session_count(user_id)
        session_number = session_count + 1

        session_id = database.create_session(user_id, session_number)

        # If "continue" mode, return cumulative stats from previous sessions
        cumulative_score = 0
        cumulative_total = 0
        cumulative_questions = 0

        if mode == 'continue':
            sessions = database.get_user_sessions(user_id)
            # Exclude the session we just created
            for s in sessions:
                if str(s['id']) != str(session_id):
                    cumulative_score += s.get('score', 0) or 0
                    cumulative_total += s.get('total_marks', 0) or 0
                    cumulative_questions += s.get('questions_solved', 0) or 0

        return jsonify({
            'status': 'success',
            'session_id': str(session_id),
            'session_number': session_number,
            'mode': mode,
            'cumulative_score': cumulative_score,
            'cumulative_total': cumulative_total,
            'cumulative_questions': cumulative_questions
        })

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/session/update', methods=['PATCH'])
def update_session():
    """Update the current session's performance data."""
    session_id = request.args.get('id')
    data = request.json

    if not session_id:
        return jsonify({'status': 'error', 'message': 'Session id is required'}), 400

    # Handle JSON serialization for vectors/matrix if they are lists
    if 'vectors' in data and data['vectors']:
        data['vectors'] = json.dumps(data['vectors'])
    if 'matrix' in data and data['matrix']:
        data['matrix'] = json.dumps(data['matrix'])

    try:
        database.update_session(session_id, data)
        return jsonify({'status': 'success'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/session/end', methods=['POST'])
def end_session():
    """Terminate a session — set completed=true and ended_at=now()."""
    data = request.json
    session_id = data.get('session_id')

    if not session_id:
        return jsonify({'status': 'error', 'message': 'session_id is required'}), 400

    try:
        database.end_session(session_id)
        return jsonify({'status': 'success'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ═══════════════════════════════════════
#  USER HISTORY
# ═══════════════════════════════════════

@app.route('/api/user/<user_id>/history', methods=['GET'])
def user_history(user_id):
    """Get all sessions for a specific user."""
    try:
        sessions = database.get_user_sessions(user_id)
        sessions_data = [_serialize_session(s) for s in sessions]
        return jsonify(sessions_data)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ═══════════════════════════════════════
#  QUESTION RESULTS ENDPOINTS
# ═══════════════════════════════════════

@app.route('/api/question/save', methods=['POST'])
def save_question():
    """Save a single question result when a problem is completed."""
    data = request.json

    required = ['session_id', 'user_id']
    for field in required:
        if not data.get(field):
            return jsonify({'status': 'error', 'message': f'{field} is required'}), 400

    try:
        qid = database.save_question_result(data)
        return jsonify({'status': 'success', 'question_id': str(qid)})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/user/<user_id>/questions', methods=['GET'])
def user_questions(user_id):
    """Get all questions a user has ever solved."""
    try:
        questions = database.get_user_questions(user_id)
        questions_data = [_serialize_question(q) for q in questions]
        return jsonify(questions_data)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/session/<session_id>/questions', methods=['GET'])
def session_questions(session_id):
    """Get all questions solved in a specific session."""
    try:
        questions = database.get_session_questions(session_id)
        questions_data = [_serialize_question(q) for q in questions]
        return jsonify(questions_data)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/admin/questions', methods=['GET'])
def admin_questions():
    """Get all questions across all users (for admin)."""
    try:
        questions = database.get_all_questions_for_admin()
        questions_data = [_serialize_question(q) for q in questions]
        return jsonify(questions_data)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ═══════════════════════════════════════
#  ADMIN ENDPOINTS
# ═══════════════════════════════════════

@app.route('/api/admin/users', methods=['GET'])
def get_admin_users():
    """Get all users with aggregated session stats."""
    try:
        users = database.get_all_users_with_stats()
        for u in users:
            u['id'] = str(u['id'])
            if u.get('created_at'):
                u['created_at'] = u['created_at'].isoformat()
        return jsonify(users)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/admin/sessions', methods=['GET'])
def get_admin_sessions():
    """Get all sessions with optional filters: ?user_id=, ?from=, ?to="""
    user_id = request.args.get('user_id')
    date_from = request.args.get('from')
    date_to = request.args.get('to')

    try:
        sessions = database.get_all_sessions_filtered(
            user_id=user_id,
            date_from=date_from,
            date_to=date_to
        )
        sessions_data = [_serialize_session(s) for s in sessions]
        return jsonify(sessions_data)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/admin/stats', methods=['GET'])
def get_admin_stats():
    """Get platform-wide aggregated statistics."""
    try:
        stats = database.get_platform_stats()
        return jsonify(stats)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/admin/clear', methods=['DELETE'])
def clear_all():
    """Delete all users and sessions."""
    try:
        database.delete_all_data()
        return jsonify({'status': 'success'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ═══════════════════════════════════════
#  LEGACY COMPAT ENDPOINTS
# ═══════════════════════════════════════

@app.route('/api/admin/students', methods=['GET'])
def get_students():
    """Legacy: get all students from old table (for backward compat)."""
    try:
        students = database.get_all_students()
        for s in students:
            s['id'] = str(s['id'])
            if s.get('login_time'):
                s['login_time'] = s['login_time'].isoformat()
        return jsonify(students)
    except Exception:
        # If old students table doesn't exist, return empty
        return jsonify([])


# ═══════════════════════════════════════
#  HELPERS
# ═══════════════════════════════════════

def _serialize_user(user):
    """Convert a user dict for JSON serialization."""
    u = dict(user)
    u['id'] = str(u['id'])
    if u.get('created_at'):
        u['created_at'] = u['created_at'].isoformat()
    return u


def _serialize_session(session):
    """Convert a session dict for JSON serialization."""
    s = dict(session)
    s['id'] = str(s['id'])
    if s.get('user_id'):
        s['user_id'] = str(s['user_id'])
    if s.get('started_at'):
        s['started_at'] = s['started_at'].isoformat()
    if s.get('ended_at'):
        s['ended_at'] = s['ended_at'].isoformat()
    return s


def _serialize_question(q):
    """Convert a question result dict for JSON serialization."""
    d = dict(q)
    d['id'] = str(d['id'])
    if d.get('session_id'):
        d['session_id'] = str(d['session_id'])
    if d.get('user_id'):
        d['user_id'] = str(d['user_id'])
    if d.get('created_at'):
        d['created_at'] = d['created_at'].isoformat()
    return d


if __name__ == '__main__':
    app.run(debug=True, port=5001)
