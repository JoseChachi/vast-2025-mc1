from flask import Flask, render_template, send_from_directory, jsonify
import os
import json

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('otherlanding2.html')

# @app.route('/xd2/')
# def index2():
#     return render_template('otherlanding.html')

# @app.route('/p1/1')
# def index3():
#     return render_template('otherlanding2.html')

# @app.route('/p1/2')
# def index4():
    # return render_template('otherrlanding2.html')

@app.route('/data/<path:filename>')
def data(filename):
    return send_from_directory('data', filename)

@app.route('/api/music-data')
def get_music_data():
    try:
        # Cargar el archivo JSON
        with open('data/MC1_graph.json', 'r', encoding='utf-8') as file:
            data = json.load(file)
        
        # Retornar los datos como JSON
        return jsonify(data)
    
    except FileNotFoundError:
        return jsonify({
            "error": "Archivo no encontrado",
            "message": "No se pudo encontrar el archivo data/MC1_graph.json"
        }), 404

@app.route('/algo1')
def algo1():
    return render_template('otherlanding.html')

@app.route('/algo2') 
def algo2():
    return render_template('otherrlanding2.html')


if __name__ == '__main__':
    app.run(debug=True)
