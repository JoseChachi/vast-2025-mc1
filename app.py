from flask import Flask, render_template, send_from_directory
import os

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('graph.html')

@app.route('/xd2/')
def index2():
    return render_template('otherlanding.html')

@app.route('/xd3/')
def index3():
    return render_template('otherlanding2.html')

@app.route('/data/<path:filename>')
def data(filename):
    return send_from_directory('data', filename)

if __name__ == '__main__':
    app.run(debug=True)
