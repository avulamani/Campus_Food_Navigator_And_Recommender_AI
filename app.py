from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
import pandas as pd
import requests
import os
from sklearn.neighbors import NearestNeighbors
from sklearn.tree import DecisionTreeClassifier
from sklearn.preprocessing import LabelEncoder

app = Flask(__name__)
CORS(app)

df = None
dt_model = None
le_cat = LabelEncoder()
le_item = LabelEncoder()

def init_models():
    global df, dt_model, le_cat, le_item
    csv_path = 'dataset.csv'
    if not os.path.exists(csv_path):
        print(f"Warning: {csv_path} not found. Waiting for dataset.")
        return
    
    df = pd.read_csv(csv_path)
    
    # Train Decision Tree
    df['category_encoded'] = le_cat.fit_transform(df['category'])
    df['item_encoded'] = le_item.fit_transform(df['food_item'])
    
    X = df[['category_encoded']]
    y = df['item_encoded']
    
    dt_model = DecisionTreeClassifier()
    dt_model.fit(X, y)

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/api/search_stall', methods=['POST'])
def search_stall():
    global df
    if df is None: init_models()
    if df is None: return jsonify({"error": "Dataset not loaded yet"}), 500
        
    data = request.json
    food_item = data.get('item', '').strip().lower()
    user_lat = data.get('lat')
    user_lon = data.get('lon')
    
    # Filter for the requested item
    matches = df[df['food_item'].str.lower() == food_item]
    if matches.empty:
        return jsonify({"error": f"Sorry, '{food_item}' is not available at any stall."})
    
    # KNN with mathematically correct Haversine distance
    import numpy as np
    coords = np.radians(matches[['latitude', 'longitude']].values)
    user_coords = np.radians([[user_lat, user_lon]])
    
    knn = NearestNeighbors(n_neighbors=1, algorithm='ball_tree', metric='haversine')
    knn.fit(coords)
    
    distances, indices = knn.kneighbors(user_coords)
    closest_index = indices[0][0]
    
    closest_stall = matches.iloc[closest_index]
    
    return jsonify({
        "message": f"Nearest stall found: {closest_stall['stall_name']}",
        "stall_name": closest_stall['stall_name'],
        "food_item": closest_stall['food_item'],
        "price": int(closest_stall['price']),
        "rating": float(closest_stall['rating']),
        "stall_lat": float(closest_stall['latitude']),
        "stall_lon": float(closest_stall['longitude'])
    })

@app.route('/api/recommend_category', methods=['POST'])
def recommend_category():
    global df, dt_model, le_cat, le_item
    if df is None: init_models()
    if df is None: return jsonify({"error": "Dataset not loaded yet"}), 500
        
    data = request.json
    category = data.get('category', '')
    
    if category not in le_cat.classes_:
        return jsonify({"error": "Category not known to the model."})
        
    cat_encoded = le_cat.transform([category])
    
    # Predict the primary recommended item
    predicted_item_encoded = dt_model.predict([cat_encoded])
    primary_recommendation = le_item.inverse_transform(predicted_item_encoded)[0]
    
    # Also find top items in that category from dataset
    cat_df = df[df['category'] == category]
    
    import random
    sample_size = min(random.randint(6, 8), len(cat_df))
    if sample_size > 0:
        cat_df = cat_df.sample(n=sample_size)
        
    cat_items = cat_df[['stall_name', 'food_item', 'price', 'rating']].to_dict('records')
    
    return jsonify({
        "message": f"Decision Tree primary recommendation: {primary_recommendation}",
        "primary": primary_recommendation,
        "items": cat_items
    })

@app.route('/api/recommend_weather', methods=['POST'])
def recommend_weather():
    global df
    if df is None: init_models()
    if df is None: return jsonify({"error": "Dataset not loaded yet"}), 500
        
    data = request.json
    lat = data.get('lat')
    lon = data.get('lon')
    
    # Using Open-Meteo which does NOT require an API key!
    weather_url = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current_weather=true"
    try:
        resp = requests.get(weather_url)
        w_data = resp.json()
        if resp.status_code != 200:
            return jsonify({"error": f"Weather API error: {w_data.get('reason', 'Unknown error')}"})
            
        temp = w_data['current_weather']['temperature']
        
        # Determine weather type and inverse temperature type for food
        if temp < 20: 
            weather_type = 'Cold'
            target_temp_type = 'Hot'
        elif temp > 30: 
            weather_type = 'Hot'
            target_temp_type = 'Cold'
        else: 
            weather_type = 'Normal'
            target_temp_type = 'Normal'
        
        # Get random items for this weather based on target temperature_type
        weather_suitable = df[df['temperature_type'] == target_temp_type]
        
        # If no items found for 'Normal', fallback to something common like 'Hot'
        if weather_suitable.empty:
            weather_suitable = df[df['temperature_type'] == 'Hot']
        
        # Suggest 5 to 10 items randomly
        sample_size = min(10, len(weather_suitable))
        if sample_size > 0:
            weather_suitable = weather_suitable.sample(n=sample_size)
            
        items = weather_suitable[['stall_name', 'food_item', 'price', 'rating']].to_dict('records')
        
        return jsonify({
            "message": f"Current weather is {weather_type} ({temp}°C). Suggesting {target_temp_type} specials!",
            "weather_type": weather_type,
            "items": items
        })
    except Exception as e:
        return jsonify({"error": str(e)})

if __name__ == '__main__':
    init_models()
    app.run(debug=True, port=5000)
