from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit
import uuid

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

# Dictionary um Session-IDs zu speichern
sessions = {}

@app.route("/server")
def server():
    return render_template("server.html")

@app.route("/client")
def client():
    return render_template("client.html")

@socketio.on("connect")
def handle_connect():
    # Generiere eine eindeutige Session-ID für jeden Client
    session_id = str(uuid.uuid4())
    sessions[request.sid] = session_id
    emit("session_id", {"session_id": session_id})

@socketio.on("disconnect")
def handle_disconnect():
    # Entferne Session-ID beim Disconnect
    if request.sid in sessions:
        del sessions[request.sid]

@socketio.on("draw")
def handle_draw(data):
    # Füge die Session-ID des Senders hinzu
    data["session_id"] = sessions.get(request.sid, "unknown")
    emit("draw", data, broadcast=True, include_self=False)

if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=1337)
