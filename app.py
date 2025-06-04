from flask import Flask, render_template, send_from_directory
import os

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('graph.html')

@app.route('/data/<path:filename>')
def data(filename):
    return send_from_directory('data', filename)

if __name__ == '__main__':
    app.run(debug=True)
