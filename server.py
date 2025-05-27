from flask import Flask, render_template
from flask_socketio import SocketIO, emit

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

@app.route("/server")
def server():
    return render_template("server.html")

@app.route("/client")
def client():
    return render_template("client.html")

@socketio.on("draw")
def handle_draw(data):
    emit("draw", data, broadcast=True, include_self=False)

if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=1337)
