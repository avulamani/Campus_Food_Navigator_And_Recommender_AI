// App State
let map;
let routingControl;
let userLat = null;
let userLon = null;
let userMarker = null;
let locationActive = false;
let watchId = null;

const blueIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const redIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

let currentTileLayer;

// Initialize Map
function initMap() {
    map = L.map('map').setView([17.3850, 78.4867], 14);

    // Google Maps Satellite Hybrid Layer (Shows actual building roofs + labels)
    currentTileLayer = L.tileLayer('http://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        attribution: '&copy; Google Maps',
        subdomains: ['mt0','mt1','mt2','mt3'],
        maxZoom: 21
    }).addTo(map);

    // Developer Mock Location Tool: Double click map to teleport!
    map.doubleClickZoom.disable(); 
    map.on('dblclick', function(e) {
        // 1. Stop actual WiFi geolocation so it doesn't snap back
        if (watchId !== null) {
            navigator.geolocation.clearWatch(watchId);
            watchId = null;
        }
        
        // 2. Set user coordinate to the click location
        userLat = e.latlng.lat;
        userLon = e.latlng.lng;
        locationActive = true;
        
        // 3. Update the toggle button text
        const locBtn = document.getElementById('locationToggleBtn');
        if (locBtn) {
            locBtn.innerHTML = '📍 Mock: ON';
            locBtn.classList.add('active');
        }
        
        setStatus("Dev Mock: Teleported to selected location!");
        
        // 4. Update or create the marker
        if (!userMarker) {
            userMarker = L.marker([userLat, userLon], {icon: blueIcon, draggable: true, title: "Drag to move"}).addTo(map)
                .bindPopup("You are here");
                
            userMarker.on('dragend', function(ev) {
                var pos = userMarker.getLatLng();
                userLat = pos.lat;
                userLon = pos.lng;
                if (routingControl) { // Recalculate route instantly!
                    const waypoints = routingControl.getWaypoints();
                    waypoints[0].latLng = L.latLng(userLat, userLon);
                    routingControl.setWaypoints(waypoints);
                }
            });
        } else {
            userMarker.setLatLng([userLat, userLon]);
        }
        
        // 5. Update the route if active
        if (routingControl) {
            const waypoints = routingControl.getWaypoints();
            waypoints[0].latLng = L.latLng(userLat, userLon);
            routingControl.setWaypoints(waypoints);
        }
    });
}

// Get User Location dynamically (continuous tracking)
function getUserLocation() {
    setStatus("Fetching your location...");
    if (navigator.geolocation) {
        // Clear existing watch if needed
        if (watchId !== null) {
            navigator.geolocation.clearWatch(watchId);
        }
        
        watchId = navigator.geolocation.watchPosition(
            (position) => {
                const isFirstTime = !userLat;
                userLat = position.coords.latitude;
                userLon = position.coords.longitude;
                locationActive = true;
                
                if (isFirstTime) {
                    setStatus("Location obtained! Tracking active. Ready to search.");
                }
                
                if (!routingControl) {
                    if (!userMarker) {
                        userMarker = L.marker([userLat, userLon], {icon: blueIcon, draggable: true, title: "Drag to move"}).addTo(map)
                            .bindPopup("You are here");
                        map.setView([userLat, userLon], 15);
                        
                        userMarker.on('dragend', function(ev) {
                            // If user explicitly drags marker, stop WiFi snapping
                            if (watchId !== null) {
                                navigator.geolocation.clearWatch(watchId);
                                watchId = null;
                                const locBtn = document.getElementById('locationToggleBtn');
                                if (locBtn) locBtn.innerHTML = '📍 Mock: ON';
                            }
                            var pos = userMarker.getLatLng();
                            userLat = pos.lat;
                            userLon = pos.lng;
                            if (routingControl) { // Recalculate route!
                                const waypoints = routingControl.getWaypoints();
                                waypoints[0].latLng = L.latLng(userLat, userLon);
                                routingControl.setWaypoints(waypoints);
                            }
                        });
                    } else {
                        userMarker.setLatLng([userLat, userLon]);
                    }
                } else {
                    const waypoints = routingControl.getWaypoints();
                    waypoints[0].latLng = L.latLng(userLat, userLon);
                    routingControl.setWaypoints(waypoints);
                }
            },
            (error) => {
                console.error("Error getting location: ", error);
                if (!userLat) setStatus("Could not get location. Ensure location permissions are allowed.", true);
            },
            { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
        );
    } else {
        setStatus("Geolocation is not supported by this browser.", true);
    }
}

function stopLocationTracking() {
    locationActive = false;
    userLat = null;
    userLon = null;
    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }
    setStatus("Location tracking stopped.");
    if (userMarker) {
        map.removeLayer(userMarker);
        userMarker = null;
    }
    if (routingControl) {
        map.removeControl(routingControl);
        routingControl = null;
    }
}

// Update Status Message
function setStatus(message, isError = false) {
    const msgEl = document.getElementById('statusMessage');
    msgEl.innerHTML = message;
    if(isError) {
        msgEl.style.color = '#ef4444'; 
        msgEl.style.borderColor = '#ef4444';
    } else {
        msgEl.style.color = 'inherit';
        msgEl.style.borderColor = 'var(--border)';
    }
}

// Calculate true physical Haversine distance to avoid OSRM road-snapping errors on campus
function getDistanceFromLatLonInM(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Radius of the earth in m
  const dLat = (lat2 - lat1) * Math.PI / 180;  
  const dLon = (lon2 - lon1) * Math.PI / 180; 
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c; 
}

// Draw Route to Stall
function routeToStall(stallLat, stallLon, stallName) {
    if (!userLat || !userLon || !locationActive) {
        alert("Please ensure location tracking is ON!");
        return;
    }

    if (routingControl) {
        map.removeControl(routingControl);
    }

    if (userMarker) {
        map.removeLayer(userMarker);
        userMarker = null;
    }

    routingControl = L.Routing.control({
        waypoints: [
            L.latLng(userLat, userLon),
            L.latLng(stallLat, stallLon)
        ],
        routeWhileDragging: false,
        addWaypoints: false,
        show: true, // Show the turn-by-turn instructions
        fitSelectedRoutes: true,
        lineOptions: {
            styles: [{ color: '#8b5cf6', weight: 6, opacity: 0.8 }]
        },
        createMarker: function(i, waypoint, n) {
            let icon = i === n - 1 ? redIcon : blueIcon;
            let label = i === 0 ? "You are here" : stallName;
            let marker = L.marker(waypoint.latLng, { icon: icon }).bindPopup(label);
            
            if (i === n - 1) { // Save reference to destination marker to update it later
                window.destMarker = marker; 
            }
            return marker;
        }
    }).addTo(map);

    routingControl.on('routesfound', function(e) {
        // Calculate true physical Haversine distance (overrides routing distance snap!)
        var trueDistance = getDistanceFromLatLonInM(userLat, userLon, stallLat, stallLon);
        
        var walkMin = Math.round((trueDistance / 1.4) / 60);
        var distStr = trueDistance > 1000 ? (trueDistance / 1000).toFixed(2) + ' km' : Math.round(trueDistance) + ' m';
        var timeStr = walkMin < 1 ? 'Less than a minute' : walkMin + ' min walk';
        
        setStatus(`Navigating to ${stallName} (${distStr}, ~${timeStr})`);
        
        if (window.destMarker) {
            window.destMarker.setPopupContent(`<b>${stallName}</b><hr style="margin:5px 0;">Distance (Straight-Line): <b>${distStr}</b><br>Est. Walk: <b>${timeStr}</b>`);
        }
        
        // After DOM updates, move the routing container so it doesn't overlap
        const routeContainer = routingControl.getContainer();
        const externalDiv = document.getElementById('routeDetailsContainer');
        if (routeContainer && externalDiv) {
            externalDiv.appendChild(routeContainer);
        }
    });
}

// Display Results List
function displayResults(dataItems) {
    const container = document.getElementById('resultsContainer');
    const list = document.getElementById('resultsList');
    
    list.innerHTML = ''; // clear old
    
    if(!dataItems || dataItems.length === 0) {
        container.classList.add('hidden');
        return;
    }

    dataItems.forEach(item => {
        const li = document.createElement('li');
        li.innerHTML = `
            <div>
                <strong>${item.stall_name || item.name}</strong><br>
                <span style="color:var(--text-muted); font-size:0.9rem;">${item.food_item || item.item} - ₹${item.price}</span>
            </div>
            <div>
                <span style="background:var(--secondary); padding:2px 8px; border-radius:12px; font-size:0.8rem;">⭐ ${item.rating || 'N/A'}</span>
            </div>
        `;
        list.appendChild(li);
    });
    
    container.classList.remove('hidden');
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    getUserLocation();

    // Theme Toggle
    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            document.body.classList.toggle('light-mode');
            if (document.body.classList.contains('light-mode')) {
                themeBtn.innerHTML = '🌙 Dark Mode';
            } else {
                themeBtn.innerHTML = '🌞 Light Mode';
            }
        });
    }

    // Location Toggle
    const locBtn = document.getElementById('locationToggleBtn');
    if (locBtn) {
        locBtn.addEventListener('click', () => {
            if (locationActive) {
                stopLocationTracking();
                locBtn.innerHTML = '📍 Location: OFF';
                locBtn.classList.remove('active');
            } else {
                getUserLocation();
                locBtn.innerHTML = '📍 Location: ON';
                locBtn.classList.add('active');
            }
        });
    }

    // Search nearest
    document.getElementById('searchBtn').addEventListener('click', async () => {
        const input = document.getElementById('searchInput').value;
        if(!input) return alert("Please enter an item to search.");
        if(!userLat) return alert("Waiting for location permissions.");

        setStatus(`Searching for nearest stalls with "${input}"...`);
        
        try {
            const res = await fetch('/api/search_stall', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ item: input, lat: userLat, lon: userLon })
            });
            const data = await res.json();
            
            if(data.error) {
                setStatus(data.error, true);
                displayResults([]); // Clear results
                return;
            }

            console.log(data);
            setStatus(data.message);
            
            // Format item wrapper for display
            displayResults([{
                stall_name: data.stall_name,
                food_item: data.food_item,
                price: data.price,
                rating: data.rating
            }]);
            
            // Trigger Navigation
            routeToStall(data.stall_lat, data.stall_lon, data.stall_name);
            
        } catch (e) {
            console.error(e);
            setStatus("Error connecting to server.", true);
        }
    });

    // Recommend Category
    document.getElementById('recommendCategoryBtn').addEventListener('click', async () => {
        const cat = document.getElementById('categorySelect').value;
        if(!cat) return alert("Please select a category.");

        setStatus(`Getting predictions for "${cat}"...`);
        
        try {
            const res = await fetch('/api/recommend_category', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ category: cat })
            });
            const data = await res.json();
            
            if(data.error) {
                setStatus(data.error, true);
                return;
            }

            console.log(data);
            setStatus(data.message);
            
            displayResults(data.items);
            
            // Auto scroll to the recommended items
            setTimeout(() => {
                const resultsContainer = document.getElementById('resultsContainer');
                if (resultsContainer && !resultsContainer.classList.contains('hidden')) {
                    resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 100);
            
        } catch (e) {
            console.error(e);
            setStatus("Error connecting to server.", true);
        }
    });

    // Weather Recommend
    document.getElementById('weatherBtn').addEventListener('click', async () => {
        if(!userLat) return alert("Waiting for location permissions.");

        setStatus(`Checking weather and finding matched items...`);
        
        try {
            const res = await fetch('/api/recommend_weather', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lat: userLat, lon: userLon })
            });
            const data = await res.json();
            
            if(data.error) {
                setStatus(data.error, true);
                return;
            }

            console.log(data);
            
            // Injecting a button immediately into the status bar HTML for quick scrolling
            const showItemsBtnHTML = `<button id="scrollItemsBtn" class="btn-primary" style="padding: 4px 12px; margin-left: 15px; font-size: 0.8rem; border-radius: 8px;">Show Items ⬇</button>`;
            setStatus(data.message + showItemsBtnHTML);
            
            // Scroll down cleanly to the message reading the current weather
            const msgEl = document.getElementById('statusMessage');
            msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            displayResults(data.items);
            
            // Activate the new button to scroll up/down dynamically to the results
            setTimeout(() => {
                const btn = document.getElementById('scrollItemsBtn');
                if (btn) {
                    btn.addEventListener('click', () => {
                        document.getElementById('resultsContainer').scrollIntoView({ behavior: 'smooth', block: 'center' });
                    });
                }
            }, 50);
            
        } catch (e) {
            console.error(e);
            setStatus("Error connecting to server.", true);
        }
    });
});
