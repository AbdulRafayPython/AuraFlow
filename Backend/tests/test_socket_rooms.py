"""
Test script to check which rooms users are in
Run this while the app is running to see active socket rooms
"""
from app import socketio, app

with app.app_context():
    # Get all active rooms
    print("\n=== ACTIVE SOCKET ROOMS ===")
    
    # Access the socket.io server
    if hasattr(socketio.server, 'manager'):
        manager = socketio.server.manager
        print(f"Manager: {manager}")
        print(f"Rooms: {manager.rooms if hasattr(manager, 'rooms') else 'Not accessible'}")
    else:
        print("Cannot access socket.io server manager")
    
    print("\n=== END ===\n")
