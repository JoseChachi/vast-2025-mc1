from flask import Flask, render_template, jsonify, send_from_directory
import json
from collections import defaultdict, Counter
from datetime import datetime

app = Flask(__name__)

def calculate_influence_metric(nodes, links, sailor_shift_id=17255):
    """
    Calcula la métrica de influencia de personas hacia Sailor Shift a través del tiempo
    """
    # Crear mapas para acceso rápido
    node_map = {node["id"]: node for node in nodes}
    
    # Encontrar todas las canciones donde Sailor Shift participó
    sailor_shift_songs = set()
    for link in links:
        if link["source"] == sailor_shift_id and node_map.get(link["target"], {}).get("Node Type") == "Song":
            sailor_shift_songs.add(link["target"])

    # Encontrar canciones que influyeron en las canciones de Sailor Shift
    influence_songs = set()
    influence_relations = ["InStyleOf", "InterpolatesFrom", "CoverOf", "LyricalReferenceTo", "DirectlySamples"]
    
    for link in links:
        if link["target"] in sailor_shift_songs and link["Edge Type"] in influence_relations:
            influence_songs.add(link["source"])

    # Encontrar personas que participaron en canciones influyentes
    influence_data = defaultdict(lambda: defaultdict(int))
    
    for link in links:
        if link["target"] in influence_songs:
            source_node = node_map.get(link["source"])
            target_node = node_map.get(link["target"])
            
            if source_node and source_node["Node Type"] == "Person" and target_node:
                # Obtener año de la canción
                year = target_node.get("release_date", "Unknown")
                if year != "Unknown":
                    try:
                        year = int(year)
                        person_name = source_node["name"]
                        influence_data[year][person_name] += 1
                    except ValueError:
                        pass

    return influence_data

def calculate_influence_metric_with_albums(nodes, links, sailor_shift_id=17255):
    """
    Calcula la métrica de influencia de personas hacia Sailor Shift a través del tiempo
    Incluye tanto canciones como álbumes en las relaciones de influencia
    """
    # Crear mapas para acceso rápido
    node_map = {node["id"]: node for node in nodes}
    
    # Debug: Verificar información sobre Sailor Shift
    sailor_shift_node = node_map.get(sailor_shift_id)

    # Encontrar todas las canciones y álbumes donde Sailor Shift participó
    sailor_shift_works = set()
    sailor_shift_relations = []
    
    for link in links:
        if link["source"] == sailor_shift_id:
            target_node = node_map.get(link["target"])
            if target_node and target_node["Node Type"] in ["Song", "Album"]:
                sailor_shift_works.add(link["target"])
                sailor_shift_relations.append({
                    "target": link["target"],
                    "type": target_node["Node Type"],
                    "name": target_node.get("name", "Unknown"),
                    "relation": link["Edge Type"]
                })

    # Encontrar obras que influyeron en las obras de Sailor Shift
    influence_works = set()
    influence_relations = ["InStyleOf", "InterpolatesFrom", "CoverOf", "LyricalReferenceTo", "DirectlySamples"]
    influence_links = []
    
    for link in links:
        if link["source"] in sailor_shift_works and link["Edge Type"] in influence_relations:
            target_node = node_map.get(link["target"])
            if target_node and target_node["Node Type"] in ["Song", "Album"]:
                influence_works.add(link["target"])
                influence_links.append({
                    "source_work": node_map.get(link["source"], {}).get("name", "Unknown"),
                    "target_work": target_node.get("name", "Unknown"),
                    "relation": link["Edge Type"],
                    "target_id": link["target"]
                })
    

    # Encontrar personas que participaron en obras influyentes
    influence_data = defaultdict(lambda: defaultdict(int))
    person_influences = []
    
    for link in links:
        if link["target"] in influence_works:
            source_node = node_map.get(link["source"])
            target_node = node_map.get(link["target"])
            
            if source_node and source_node["Node Type"] == "Person" and target_node:
                # Obtener año de la obra
                year = target_node.get("release_date", "Unknown")
                if year != "Unknown":
                    try:
                        year = int(year)
                        person_name = source_node["name"]
                        influence_data[year][person_name] += 1
                        person_influences.append({
                            "person": person_name,
                            "work": target_node.get("name", "Unknown"),
                            "year": year,
                            "relation": link["Edge Type"]
                        })
                    except ValueError:
                        pass
    

    return influence_data

def calculate_cumulative_influence_with_albums(nodes, links, sailor_shift_id=17255):
    """
    Calcula la influencia acumulativa de personas hacia Sailor Shift a través del tiempo
    Incluye álbumes además de canciones
    """
    # Obtener datos de influencia por año
    influence_data = calculate_influence_metric_with_albums(nodes, links, sailor_shift_id)
    
    # Calcular influencia acumulativa por persona
    cumulative_data = []
    person_cumulative = defaultdict(int)
    
    # Obtener todos los años únicos donde hubo influencia
    all_years = sorted(influence_data.keys())
    
    # Crear un diccionario por persona con sus años de influencia
    person_years = defaultdict(list)
    for year in all_years:
        for person, count in influence_data[year].items():
            person_years[person].append((year, count))
    
    # Calcular acumulativo solo para años donde la persona influyó
    for person, year_counts in person_years.items():
        # Ordenar por año
        year_counts.sort(key=lambda x: x[0])
        
        cumulative_total = 0
        for year, count in year_counts:
            cumulative_total += count
            cumulative_data.append({
                "year": year,
                "person": person,
                "influence_count": cumulative_total
            })
    
    return cumulative_data

@app.route('/')
def index():
    return render_template('index.html')

import os

def load_data_from_file(file_path='data/MC1_graph.json'):
    if os.path.exists(file_path):
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        return data

app_data = load_data_from_file()

@app.route('/api/influence-data')
def get_influence_data():
    """
    Endpoint para obtener los datos de influencia acumulativa procesados
    Incluye álbumes además de canciones
    """
    chart_data = calculate_cumulative_influence_with_albums(app_data["nodes"], app_data["links"])
    
    return jsonify(chart_data)

@app.route('/api/debug-sailor-shift')
def debug_sailor_shift():
    """
    Endpoint para debug - información sobre Sailor Shift
    """
    sailor_shift_id = 17255
    nodes = app_data["nodes"]
    links = app_data["links"]
    
    # Crear mapas para acceso rápido
    node_map = {node["id"]: node for node in nodes}
    
    # Información sobre Sailor Shift
    sailor_shift_node = node_map.get(sailor_shift_id)
    
    # Todas las conexiones de Sailor Shift
    sailor_shift_connections = []
    for link in links:
        if link["source"] == sailor_shift_id:
            target_node = node_map.get(link["target"])
            sailor_shift_connections.append({
                "target_id": link["target"],
                "target_name": target_node.get("name", "Unknown") if target_node else "Unknown",
                "target_type": target_node.get("Node Type", "Unknown") if target_node else "Unknown",
                "relation": link["Edge Type"]
            })
        elif link["target"] == sailor_shift_id:
            source_node = node_map.get(link["source"])
            sailor_shift_connections.append({
                "source_id": link["source"],
                "source_name": source_node.get("name", "Unknown") if source_node else "Unknown",
                "source_type": source_node.get("Node Type", "Unknown") if source_node else "Unknown",
                "relation": link["Edge Type"],
                "direction": "incoming"
            })
    
    # Estadísticas generales
    total_nodes = len(nodes)
    total_links = len(links)
    persons = len([n for n in nodes if n.get("Node Type") == "Person"])
    songs = len([n for n in nodes if n.get("Node Type") == "Song"])
    albums = len([n for n in nodes if n.get("Node Type") == "Album"])
    
    return jsonify({
        "sailor_shift_info": sailor_shift_node,
        "sailor_shift_connections": sailor_shift_connections,
        "total_connections": len(sailor_shift_connections),
        "dataset_stats": {
            "total_nodes": total_nodes,
            "total_links": total_links,
            "persons": persons,
            "songs": songs,
            "albums": albums
        }
    })

@app.route('/api/influence-data-raw')
def get_influence_data_raw():
    """
    Endpoint para obtener los datos de influencia sin acumular (original)
    """
    influence_data = calculate_influence_metric(app_data["nodes"], app_data["links"])
    
    chart_data = []
    for year in sorted(influence_data.keys()):
        for person, count in influence_data[year].items():
            chart_data.append({
                "year": year,
                "person": person,
                "influence_count": count
            })
    
    return jsonify(chart_data)

@app.route('/api/raw-data')
def get_raw_data():
    return jsonify(app_data)








# pregunta b de la p1

from collections import defaultdict
from flask import jsonify

def calculate_sailor_shift_collaborations(nodes, links, sailor_shift_id=17255):
    """
    Calcula las colaboraciones e influencias hacia Sailor Shift
    Retorna datos para visualización de grafo de red
    """
    # Crear mapas para acceso rápido
    node_map = {node["id"]: node for node in nodes}
    
    # Diccionario para contar conexiones directas de cada persona con Sailor Shift
    person_connections = defaultdict(int)
    # Set para almacenar todas las personas conectadas
    connected_persons = set()
    # Lista para almacenar las conexiones entre personas
    person_to_person_links = []
    
    # 1. Encontrar conexiones directas: Persona -> Sailor Shift
    for link in links:
        source_node = node_map.get(link["source"])
        target_node = node_map.get(link["target"])
        
        # Conexión directa: Persona -> Sailor Shift
        if (source_node and source_node["Node Type"] == "Person" and 
            link["target"] == sailor_shift_id):
            person_id = link["source"]
            person_name = source_node["name"]
            connected_persons.add(person_id)
            person_connections[person_id] += 1
        
        # Conexión directa: Sailor Shift -> Persona (también cuenta)
        elif (target_node and target_node["Node Type"] == "Person" and 
              link["source"] == sailor_shift_id):
            person_id = link["target"]
            person_name = target_node["name"]
            connected_persons.add(person_id)
            person_connections[person_id] += 1
    
    # 2. Encontrar conexiones indirectas: Persona -> Trabajo -> Sailor Shift
    # Primero, encontrar todos los trabajos (canciones/álbumes) conectados a Sailor Shift
    sailor_shift_works = set()
    for link in links:
        target_node = node_map.get(link["target"])
        source_node = node_map.get(link["source"])
        
        if link["source"] == sailor_shift_id and target_node:
            if target_node["Node Type"] in ["Song", "Album"]:
                sailor_shift_works.add(link["target"])
        elif link["target"] == sailor_shift_id and source_node:
            if source_node["Node Type"] in ["Song", "Album"]:
                sailor_shift_works.add(link["source"])
    
    # Ahora encontrar personas conectadas a esos trabajos
    for link in links:
        source_node = node_map.get(link["source"])
        target_node = node_map.get(link["target"])
        
        # Persona -> Trabajo de Sailor Shift
        if (source_node and source_node["Node Type"] == "Person" and 
            link["target"] in sailor_shift_works):
            person_id = link["source"]
            connected_persons.add(person_id)
            person_connections[person_id] += 1
        
        # Trabajo de Sailor Shift -> Persona
        elif (target_node and target_node["Node Type"] == "Person" and 
              link["source"] in sailor_shift_works):
            person_id = link["target"]
            connected_persons.add(person_id)
            person_connections[person_id] += 1
    
    # 3. Encontrar conexiones entre las personas conectadas (para el grafo)
    connected_persons_list = list(connected_persons)
    for i, person1_id in enumerate(connected_persons_list):
        for j, person2_id in enumerate(connected_persons_list):
            if i < j:  # Evitar duplicados
                # Buscar si están conectados directamente o a través de trabajos
                for link in links:
                    source_node = node_map.get(link["source"])
                    target_node = node_map.get(link["target"])
                    
                    # Conexión directa entre personas
                    if ((link["source"] == person1_id and link["target"] == person2_id) or
                        (link["source"] == person2_id and link["target"] == person1_id)):
                        person_to_person_links.append({
                            "source": person1_id,
                            "target": person2_id,
                            "type": "direct"
                        })
                        break
    
    # También buscar conexiones indirectas (personas que trabajaron en el mismo proyecto)
    work_collaborators = defaultdict(set)
    for link in links:
        source_node = node_map.get(link["source"])
        target_node = node_map.get(link["target"])
        
        if source_node and source_node["Node Type"] == "Person":
            if target_node and target_node["Node Type"] in ["Song", "Album"]:
                work_collaborators[link["target"]].add(link["source"])
        elif target_node and target_node["Node Type"] == "Person":
            if source_node and source_node["Node Type"] in ["Song", "Album"]:
                work_collaborators[link["source"]].add(link["target"])
    
    # Crear enlaces entre colaboradores del mismo trabajo
    for work_id, collaborators in work_collaborators.items():
        collaborators_list = list(collaborators.intersection(connected_persons))
        for i, person1_id in enumerate(collaborators_list):
            for j, person2_id in enumerate(collaborators_list):
                if i < j:
                    # Verificar que no tengamos ya este enlace
                    link_exists = any(
                        (link["source"] == person1_id and link["target"] == person2_id) or
                        (link["source"] == person2_id and link["target"] == person1_id)
                        for link in person_to_person_links
                    )
                    if not link_exists:
                        person_to_person_links.append({
                            "source": person1_id,
                            "target": person2_id,
                            "type": "collaboration"
                        })
    
    # 4. Preparar datos para el grafo
    graph_nodes = []
    for person_id in connected_persons:
        person_node = node_map.get(person_id)
        if person_node:
            graph_nodes.append({
                "id": person_id,
                "name": person_node["name"],
                "connections_to_sailor": person_connections[person_id],
                "type": "Person"
            })
    
    return {
        "nodes": graph_nodes,
        "links": person_to_person_links,
        "total_connected_persons": len(connected_persons),
        "max_connections": max(person_connections.values()) if person_connections else 0
    }

def get_person_all_connections(nodes, links, person_id):
    """
    Obtiene TODAS las conexiones de una persona específica desde los datos originales
    """
    # Crear mapas para acceso rápido
    node_map = {node["id"]: node for node in nodes}
    person_node = node_map.get(person_id)
    
    if not person_node or person_node["Node Type"] != "Person":
        return {"error": "Persona no encontrada"}
    
    # Set para almacenar personas conectadas
    connected_persons = set()
    # Lista para almacenar los enlaces del mini-grafo
    mini_links = []
    
    # 1. Buscar conexiones directas persona a persona
    for link in links:
        source_node = node_map.get(link["source"])
        target_node = node_map.get(link["target"])
        
        # Conexión directa entre personas
        if (source_node and source_node["Node Type"] == "Person" and
            target_node and target_node["Node Type"] == "Person"):
            
            if link["source"] == person_id:
                connected_persons.add(link["target"])
                mini_links.append({
                    "source": person_id,
                    "target": link["target"],
                    "type": "direct"
                })
            elif link["target"] == person_id:
                connected_persons.add(link["source"])
                mini_links.append({
                    "source": person_id,
                    "target": link["source"],
                    "type": "direct"
                })
    
    # 2. Buscar conexiones indirectas a través de trabajos (canciones/álbumes)
    person_works = set()
    
    # Encontrar todos los trabajos de esta persona
    for link in links:
        source_node = node_map.get(link["source"])
        target_node = node_map.get(link["target"])
        
        if link["source"] == person_id and target_node and target_node["Node Type"] in ["Song", "Album"]:
            person_works.add(link["target"])
        elif link["target"] == person_id and source_node and source_node["Node Type"] in ["Song", "Album"]:
            person_works.add(link["source"])
    
    # Encontrar otras personas que trabajaron en los mismos proyectos
    for work_id in person_works:
        for link in links:
            source_node = node_map.get(link["source"])
            target_node = node_map.get(link["target"])
            
            # Persona conectada al mismo trabajo
            if (source_node and source_node["Node Type"] == "Person" and 
                link["target"] == work_id and link["source"] != person_id):
                connected_persons.add(link["source"])
                # Verificar que no tengamos ya este enlace
                link_exists = any(
                    (l["source"] == person_id and l["target"] == link["source"]) or
                    (l["source"] == link["source"] and l["target"] == person_id)
                    for l in mini_links
                )
                if not link_exists:
                    mini_links.append({
                        "source": person_id,
                        "target": link["source"],
                        "type": "collaboration"
                    })
            
            elif (target_node and target_node["Node Type"] == "Person" and 
                  link["source"] == work_id and link["target"] != person_id):
                connected_persons.add(link["target"])
                # Verificar que no tengamos ya este enlace
                link_exists = any(
                    (l["source"] == person_id and l["target"] == link["target"]) or
                    (l["source"] == link["target"] and l["target"] == person_id)
                    for l in mini_links
                )
                if not link_exists:
                    mini_links.append({
                        "source": person_id,
                        "target": link["target"],
                        "type": "collaboration"
                    })
    
    # 3. Encontrar conexiones entre las personas conectadas (enlaces secundarios)
    connected_list = list(connected_persons)
    secondary_links = []
    
    for i, person1_id in enumerate(connected_list):
        for j, person2_id in enumerate(connected_list):
            if i < j:
                # Buscar conexión directa
                for link in links:
                    source_node = node_map.get(link["source"])
                    target_node = node_map.get(link["target"])
                    
                    if (source_node and source_node["Node Type"] == "Person" and
                        target_node and target_node["Node Type"] == "Person"):
                        
                        if ((link["source"] == person1_id and link["target"] == person2_id) or
                            (link["source"] == person2_id and link["target"] == person1_id)):
                            secondary_links.append({
                                "source": person1_id,
                                "target": person2_id,
                                "type": "secondary"
                            })
                            break
                
                # Si no hay conexión directa, buscar colaboración en mismo trabajo
                if not any(l["source"] in [person1_id, person2_id] and l["target"] in [person1_id, person2_id] for l in secondary_links):
                    # Buscar trabajos en común
                    person1_works = set()
                    person2_works = set()
                    
                    for link in links:
                        source_node = node_map.get(link["source"])
                        target_node = node_map.get(link["target"])
                        
                        if link["source"] == person1_id and target_node and target_node["Node Type"] in ["Song", "Album"]:
                            person1_works.add(link["target"])
                        elif link["target"] == person1_id and source_node and source_node["Node Type"] in ["Song", "Album"]:
                            person1_works.add(link["source"])
                        
                        if link["source"] == person2_id and target_node and target_node["Node Type"] in ["Song", "Album"]:
                            person2_works.add(link["target"])
                        elif link["target"] == person2_id and source_node and source_node["Node Type"] in ["Song", "Album"]:
                            person2_works.add(link["source"])
                    
                    # Si tienen trabajos en común, agregar enlace secundario
                    if person1_works.intersection(person2_works):
                        secondary_links.append({
                            "source": person1_id,
                            "target": person2_id,
                            "type": "secondary"
                        })
    
    # 4. Preparar nodos del mini-grafo
    mini_nodes = []
    
    # Nodo central
    mini_nodes.append({
        "id": person_id,
        "name": person_node["name"],
        "type": "Person",
        "isCenter": True
    })
    
    # Nodos conectados
    for connected_id in connected_persons:
        connected_node = node_map.get(connected_id)
        if connected_node:
            mini_nodes.append({
                "id": connected_id,
                "name": connected_node["name"],
                "type": "Person",
                "isCenter": False
            })
    
    return {
        "nodes": mini_nodes,
        "links": mini_links + secondary_links,
        "center_person": person_node["name"],
        "connected_count": len(connected_persons)
    }

@app.route('/api/sailor-shift-direct-collaborations')
def get_sailor_shift_collaborations():
    """
    Endpoint para obtener el grafo inicial de colaboraciones hacia Sailor Shift
    """
    collaboration_data = calculate_sailor_shift_collaborations(app_data["nodes"], app_data["links"])
    return jsonify(collaboration_data)

@app.route('/api/person-connections/<int:person_id>')
def get_person_connections_endpoint(person_id):
    """
    Endpoint para obtener TODAS las conexiones de una persona específica
    """
    person_data = get_person_all_connections(app_data["nodes"], app_data["links"], person_id)
    return jsonify(person_data)

@app.route('/collaborations')
def collaborations():
    return render_template('collaborations.html')


# para el 1 c -----------------

# Cargar datos al inicializar
try:
    with open('data/MC1_graph.json', 'r', encoding='utf-8') as f:
        graph_data = json.load(f)
except FileNotFoundError:
    graph_data = {"nodes": [], "links": []}

def process_oceanus_collaborations():
    """
    Procesa las colaboraciones de Sailor Shift en el género Oceanus Folk
    Retorna una lista de colaboradores con sus datos de timeline
    """
    nodes = graph_data['nodes']
    links = graph_data['links']
    
    # ID de Sailor Shift
    SAILOR_SHIFT_ID = 17255
        
    # 1. Encontrar todas las obras de Oceanus Folk
    oceanus_works = []
    for node in nodes:
        if (node.get('Node Type') in ['Song', 'Album'] and 
            node.get('genre') == 'Oceanus Folk'):
            oceanus_works.append(node)
    
    oceanus_work_ids = set(work['id'] for work in oceanus_works)
    
    # 2. Tipos de relaciones que consideramos colaboraciones
    collaboration_relations = ['PerformerOf', 'ComposerOf', 'ProducerOf', 'LyricistOf']
    
    # 3. Encontrar obras donde Sailor Shift colaboró
    sailor_shift_works = set()
    for link in links:
        if link['Edge Type'] in collaboration_relations:
            # Sailor Shift colabora en una obra de Oceanus Folk
            if (link['source'] == SAILOR_SHIFT_ID and link['target'] in oceanus_work_ids):
                sailor_shift_works.add(link['target'])
            elif (link['target'] == SAILOR_SHIFT_ID and link['source'] in oceanus_work_ids):
                sailor_shift_works.add(link['source'])
    
    
    # 4. Encontrar otros colaboradores en esas mismas obras
    collaborators_info = defaultdict(lambda: {
        'name': '',
        'works': [],
        'collaboration_years': [],
        'all_years': []  # Para calcular inicio de carrera
    })
    
    # Buscar todos los colaboradores en las obras donde participó Sailor Shift
    for link in links:
        if link['Edge Type'] in collaboration_relations:
            work_id = None
            collaborator_id = None
            
            # Determinar si el enlace involucra una obra de Sailor Shift
            if link['source'] in sailor_shift_works:
                work_id = link['source']
                collaborator_id = link['target']
            elif link['target'] in sailor_shift_works:
                work_id = link['target'] 
                collaborator_id = link['source']
            
            # Solo personas, no Sailor Shift mismo
            if work_id and collaborator_id and collaborator_id != SAILOR_SHIFT_ID:
                collaborator_node = next((n for n in nodes if n['id'] == collaborator_id), None)
                
                if collaborator_node and collaborator_node.get('Node Type') == 'Person':
                    work_node = next((w for w in oceanus_works if w['id'] == work_id), None)
                    
                    if work_node:
                        collaborators_info[collaborator_id]['name'] = collaborator_node.get('name', f'Artist_{collaborator_id}')
                        collaborators_info[collaborator_id]['works'].append({
                            'name': work_node.get('name', 'Sin título'),
                            'year': work_node.get('release_date', 'N/A'),
                            'type': work_node.get('Node Type', 'Unknown')
                        })
                        
                        # Extraer año
                        release_date = work_node.get('release_date')
                        if release_date:
                            try:
                                year = int(str(release_date)[:4]) if release_date else None
                                if year and 1900 <= year <= 2025:
                                    collaborators_info[collaborator_id]['collaboration_years'].append(year)
                            except (ValueError, TypeError):
                                pass
    
    
    # 5. Para cada colaborador, encontrar TODAS sus obras para calcular inicio Y FIN de carrera
    for collab_id, collab_data in collaborators_info.items():
        all_collaborator_years = []
        
        # Buscar todas las obras del colaborador (no solo Oceanus Folk)
        for link in links:
            if link['Edge Type'] in collaboration_relations:
                work_id = None
                
                if link['source'] == collab_id:
                    work_id = link['target']
                elif link['target'] == collab_id:
                    work_id = link['source']
                
                if work_id:
                    work_node = next((n for n in nodes if n['id'] == work_id and 
                                    n.get('Node Type') in ['Song', 'Album']), None)
                    if work_node:
                        release_date = work_node.get('release_date')
                        if release_date:
                            try:
                                year = int(str(release_date)[:4]) if release_date else None
                                if year and 1900 <= year <= 2050:  # Extendido hasta 2050
                                    all_collaborator_years.append(year)
                            except (ValueError, TypeError):
                                pass
        
        collab_data['all_years'] = sorted(list(set(all_collaborator_years)))
    
    # 6. Crear resultado final
    final_collaborators = []
    
    for collab_id, collab_data in collaborators_info.items():
        if not collab_data['collaboration_years'] or not collab_data['all_years']:
            continue
            
        career_start = min(collab_data['all_years'])
        sailor_shift_start = min(collab_data['collaboration_years'])
        career_end = max(collab_data['all_years'])
        
        # Solo incluir si tiene sentido cronológicamente
        if career_start <= sailor_shift_start:
            final_collaborators.append({
                'name': collab_data['name'],
                'careerStart': career_start,
                'careerEnd': career_end,
                'sailorShiftStart': sailor_shift_start,
                'collaborations': len(collab_data['works']),
                'works': [w['name'] for w in collab_data['works']],
                'work_details': collab_data['works'],
                'hasPostSailorWorks': career_end > 2024  # Indica si siguió trabajando después
            })
    
    # Ordenar por número de colaboraciones (descendente)
    final_collaborators.sort(key=lambda x: x['collaborations'], reverse=True)
    

    return final_collaborators

@app.route('/api/collaborations')
def get_collaborations():
    """
    Endpoint que retorna las colaboraciones procesadas de Sailor Shift en Oceanus Folk
    """
    try:
        collaborators = process_oceanus_collaborations()
        
        return jsonify({
            'success': True,
            'collaborators': collaborators,
            'total_count': len(collaborators),
            'sailor_shift_id': 17255,
            'genre': 'Oceanus Folk'
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'collaborators': []
        }), 500


@app.route('/influence')
def influence():
    return render_template('influence.html')

@app.route('/p1/prev')
def p1():
    return render_template('otherlanding2.html')

@app.route('/p1')
def p1_prev():
    return render_template('p1.html')


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


if __name__ == '__main__':
    app.run(debug=True)