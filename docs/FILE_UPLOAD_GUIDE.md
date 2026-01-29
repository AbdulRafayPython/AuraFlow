# AuraFlow - File Upload with MongoDB GridFS

**Document Version:** 1.0  
**Date:** January 26, 2026  
**Project:** AuraFlow - Intelligent Real-Time Communication with AI Agents  
**Topic:** Complete file uploading setup using MongoDB GridFS

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Step-by-Step Installation](#step-by-step-installation)
4. [Backend Implementation](#backend-implementation)
5. [Frontend Implementation](#frontend-implementation)
6. [Database Schema](#database-schema)
7. [API Endpoints](#api-endpoints)
8. [Testing](#testing)
9. [Troubleshooting](#troubleshooting)
10. [Best Practices](#best-practices)

---

## Overview

### What is GridFS?

**GridFS** is a MongoDB specification for storing and retrieving large files that exceed the BSON document size limit of 16MB. It:

- Divides files into chunks (255KB each by default)
- Stores chunks in a collection
- Stores metadata (filename, user_id, upload_date) in another collection
- Allows efficient upload/download of large files
- Maintains file integrity with checksums

### Why GridFS for AuraFlow?

✅ **Advantages:**
- Store files directly in MongoDB (no separate file server needed)
- Atomic operations with database transactions
- Easy backup and replication with MongoDB backups
- Scalable - handles multiple large files efficiently
- Built-in metadata support
- Access control integration with user system

### File Types Supported

- **Documents:** PDF, DOC, DOCX, XLS, XLSX, TXT
- **Images:** JPG, JPEG, PNG, GIF
- **Media:** MP4, MP3, WAV
- **Others:** Configurable in `.env`

---

## Prerequisites

### System Requirements

- Python 3.8+
- MongoDB 4.0+ (local or Atlas)
- Node.js 14+
- pip (Python package manager)

### Knowledge Required

- Basic Flask concepts
- MongoDB basics
- React concepts
- API integration

---

## Step-by-Step Installation

### Step 1: Install Python Dependencies

Navigate to Backend directory and install required packages:

```bash
cd Backend
pip install pymongo motor gridfs python-multipart
```

**Package Breakdown:**

| Package | Purpose |
|---------|---------|
| `pymongo` | MongoDB Python driver |
| `motor` | Async MongoDB driver (optional for production) |
| `gridfs` | GridFS support for large files |
| `python-multipart` | Handle multipart form data (file uploads) |

### Step 2: Update `.env` File

Add MongoDB and file upload configuration to `.env`:

```env
# ===== EXISTING MySQL CONFIG =====
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=auraflow

# ===== NEW MONGODB CONFIG =====
MONGODB_URL=mongodb://localhost:27017/auraflow
MONGODB_ATLAS_URL=mongodb+srv://username:password@cluster0.mongodb.net/auraflow?retryWrites=true&w=majority
USE_MONGODB_ATLAS=false

# ===== FILE UPLOAD CONFIG =====
MAX_FILE_SIZE=52428800
ALLOWED_EXTENSIONS=pdf,txt,doc,docx,xls,xlsx,jpg,jpeg,png,gif,mp4,mp3,wav
UPLOAD_FOLDER=uploads
```

**Configuration Explanation:**

| Variable | Value | Description |
|----------|-------|-------------|
| `MONGODB_URL` | `mongodb://localhost:27017/auraflow` | Local MongoDB connection |
| `MONGODB_ATLAS_URL` | `mongodb+srv://...` | Cloud MongoDB connection (Atlas) |
| `USE_MONGODB_ATLAS` | `false` or `true` | Which connection to use |
| `MAX_FILE_SIZE` | `52428800` | 50MB in bytes |
| `ALLOWED_EXTENSIONS` | comma-separated | File types allowed |

### Step 3: Update `config.py`

Update `Backend/config.py` to include MongoDB configuration:

```python
import os
from dotenv import load_dotenv

load_dotenv()

# ===== MYSQL CONFIG (Existing) =====
DB_HOST = os.getenv('DB_HOST')
DB_USER = os.getenv('DB_USER')
DB_PASSWORD = os.getenv('DB_PASSWORD')
DB_NAME = os.getenv('DB_NAME')

# ===== MONGODB CONFIG (New) =====
MONGODB_URL = os.getenv('MONGODB_URL', 'mongodb://localhost:27017/auraflow')
MONGODB_ATLAS_URL = os.getenv('MONGODB_ATLAS_URL')
USE_MONGODB_ATLAS = os.getenv('USE_MONGODB_ATLAS', 'false').lower() == 'true'

# ===== FILE UPLOAD CONFIG (New) =====
MAX_FILE_SIZE = int(os.getenv('MAX_FILE_SIZE', 52428800))  # 50MB
ALLOWED_EXTENSIONS = os.getenv('ALLOWED_EXTENSIONS', 'pdf,txt,doc,docx,jpg,jpeg,png').split(',')
UPLOAD_FOLDER = os.getenv('UPLOAD_FOLDER', 'uploads')

# ===== EXISTING CONFIGS =====
SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "465"))
SMTP_EMAIL = os.getenv("SMTP_EMAIL", "")
SMTP_APP_PASSWORD = os.getenv("SMTP_APP_PASSWORD", "")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

print("[CONFIG] ✅ All configurations loaded successfully")
```

### Step 4: Create MongoDB Service Module

Create `Backend/services/mongodb_service.py`:

```python
"""
MongoDB Service Module
Handles all MongoDB operations including GridFS
"""

from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError
from gridfs import GridFS
import os
from config import MONGODB_URL, MONGODB_ATLAS_URL, USE_MONGODB_ATLAS
import logging

log = logging.getLogger(__name__)


class MongoDBService:
    """Singleton pattern for MongoDB connection"""
    
    _instance = None
    _client = None
    _db = None
    _fs = None
    
    @classmethod
    def get_instance(cls):
        """Get or create MongoDB instance"""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance
    
    def __init__(self):
        """Initialize MongoDB connection"""
        try:
            # Choose connection URL
            mongo_url = MONGODB_ATLAS_URL if USE_MONGODB_ATLAS else MONGODB_URL
            
            log.info(f"[MONGODB] Connecting to MongoDB...")
            log.info(f"[MONGODB] Using Atlas: {USE_MONGODB_ATLAS}")
            
            # Create connection with timeout
            self._client = MongoClient(
                mongo_url,
                serverSelectionTimeoutMS=5000,
                connectTimeoutMS=10000,
                socketTimeoutMS=5000,
                maxPoolSize=10
            )
            
            # Test connection
            self._client.admin.command('ping')
            
            # Get database
            self._db = self._client['auraflow']
            
            # Initialize GridFS
            self._fs = GridFS(self._db)
            
            log.info("[MONGODB] ✅ Connection successful")
            log.info("[MONGODB] ✅ GridFS initialized")
            
        except (ConnectionFailure, ServerSelectionTimeoutError) as e:
            log.error(f"[MONGODB] ❌ Connection failed: {e}")
            log.error("[MONGODB] Make sure MongoDB is running!")
            raise
        except Exception as e:
            log.error(f"[MONGODB] ❌ Initialization error: {e}")
            raise
    
    def get_db(self):
        """Get database instance"""
        return self._db
    
    def get_fs(self):
        """Get GridFS instance"""
        return self._fs
    
    def is_connected(self):
        """Check if connected to MongoDB"""
        try:
            self._client.admin.command('ping')
            return True
        except:
            return False
    
    def close(self):
        """Close MongoDB connection"""
        if self._client:
            self._client.close()
            log.info("[MONGODB] Connection closed")


def get_mongodb():
    """Get MongoDB service instance"""
    return MongoDBService.get_instance()


def get_gridfs():
    """Get GridFS instance"""
    return MongoDBService.get_instance().get_fs()
```

### Step 5: Create File Upload Service

Create `Backend/services/file_service.py`:

```python
"""
File Upload Service
Handles all file operations with MongoDB GridFS
"""

from gridfs import GridFS
from gridfs.errors import NoFile
from pymongo.errors import OperationalError
from werkzeug.utils import secure_filename
from datetime import datetime
import os
import mimetypes
from config import MAX_FILE_SIZE, ALLOWED_EXTENSIONS
from services.mongodb_service import get_gridfs, get_mongodb
import logging
import io
from bson.objectid import ObjectId

log = logging.getLogger(__name__)


class FileUploadService:
    """Service for handling file uploads and downloads"""
    
    @staticmethod
    def is_allowed_file(filename):
        """
        Check if file extension is allowed
        
        Args:
            filename (str): Filename to check
            
        Returns:
            bool: True if allowed, False otherwise
        """
        if '.' not in filename:
            return False
        ext = filename.rsplit('.', 1)[1].lower()
        return ext in ALLOWED_EXTENSIONS
    
    @staticmethod
    def upload_file(file, user_id, file_category='general', metadata=None):
        """
        Upload file to MongoDB GridFS
        
        Args:
            file: FileStorage object from Flask request
            user_id (int): ID of user uploading file
            file_category (str): Type of file (message, avatar, document, etc.)
            metadata (dict): Additional metadata to store
        
        Returns:
            dict: {
                'success': bool,
                'file_id': str (ObjectId),
                'filename': str,
                'size': int,
                'url': str,
                'error': str (if failed)
            }
        """
        try:
            # Validate file exists
            if not file or file.filename == '':
                return {'success': False, 'error': 'No file selected'}
            
            # Check file extension
            if not FileUploadService.is_allowed_file(file.filename):
                allowed = ", ".join(ALLOWED_EXTENSIONS)
                return {
                    'success': False,
                    'error': f'File type not allowed. Allowed: {allowed}'
                }
            
            # Check file size
            file.seek(0, os.SEEK_END)
            file_size = file.tell()
            file.seek(0)
            
            if file_size > MAX_FILE_SIZE:
                max_mb = MAX_FILE_SIZE / 1024 / 1024
                return {
                    'success': False,
                    'error': f'File too large. Max size: {max_mb:.1f}MB'
                }
            
            # Secure the filename
            filename = secure_filename(file.filename)
            
            # Read file content
            file_content = file.read()
            
            # Prepare metadata
            gridfs_metadata = {
                'user_id': user_id,
                'original_filename': filename,
                'file_category': file_category,
                'file_size': file_size,
                'mime_type': mimetypes.guess_type(filename)[0] or 'application/octet-stream',
                'uploaded_at': datetime.utcnow(),
            }
            
            # Merge additional metadata
            if metadata:
                gridfs_metadata.update(metadata)
            
            # Upload to GridFS
            fs = get_gridfs()
            file_id = fs.put(
                file_content,
                filename=filename,
                **gridfs_metadata
            )
            
            log.info(f"[FILE] ✅ Uploaded: {filename} ({file_size} bytes, ID: {file_id})")
            
            return {
                'success': True,
                'file_id': str(file_id),
                'filename': filename,
                'size': file_size,
                'url': f'/api/files/download/{file_id}',
                'mime_type': gridfs_metadata['mime_type']
            }
        
        except Exception as e:
            log.error(f"[FILE] ❌ Upload error: {e}", exc_info=True)
            return {'success': False, 'error': str(e)}
    
    @staticmethod
    def download_file(file_id):
        """
        Download file from GridFS
        
        Args:
            file_id (str): File ObjectId
        
        Returns:
            dict: {
                'success': bool,
                'file_data': bytes,
                'filename': str,
                'mime_type': str,
                'error': str (if failed)
            }
        """
        try:
            fs = get_gridfs()
            
            # Convert string ID to ObjectId
            if isinstance(file_id, str):
                file_id = ObjectId(file_id)
            
            # Get file from GridFS
            grid_out = fs.get(file_id)
            
            file_data = grid_out.read()
            filename = grid_out.filename
            mime_type = grid_out.metadata.get('mime_type', 'application/octet-stream')
            
            log.info(f"[FILE] ✅ Downloaded: {filename}")
            
            return {
                'success': True,
                'file_data': file_data,
                'filename': filename,
                'mime_type': mime_type,
                'metadata': grid_out.metadata
            }
        
        except NoFile:
            log.error(f"[FILE] ❌ File not found: {file_id}")
            return {'success': False, 'error': 'File not found'}
        except Exception as e:
            log.error(f"[FILE] ❌ Download error: {e}")
            return {'success': False, 'error': str(e)}
    
    @staticmethod
    def delete_file(file_id, user_id=None):
        """
        Delete file from GridFS
        
        Args:
            file_id (str): File ObjectId
            user_id (int): Optional - verify user owns file
        
        Returns:
            dict: {'success': bool, 'error': str (if failed)}
        """
        try:
            fs = get_gridfs()
            
            if isinstance(file_id, str):
                file_id = ObjectId(file_id)
            
            # Verify ownership if user_id provided
            if user_id:
                grid_out = fs.get(file_id)
                if grid_out.metadata.get('user_id') != user_id:
                    return {'success': False, 'error': 'Permission denied'}
            
            fs.delete(file_id)
            
            log.info(f"[FILE] ✅ Deleted: {file_id}")
            return {'success': True}
        
        except NoFile:
            return {'success': False, 'error': 'File not found'}
        except Exception as e:
            log.error(f"[FILE] ❌ Delete error: {e}")
            return {'success': False, 'error': str(e)}
    
    @staticmethod
    def get_file_info(file_id):
        """
        Get file metadata without downloading content
        
        Args:
            file_id (str): File ObjectId
        
        Returns:
            dict: File metadata and info
        """
        try:
            fs = get_gridfs()
            
            if isinstance(file_id, str):
                file_id = ObjectId(file_id)
            
            grid_out = fs.get(file_id)
            metadata = grid_out.metadata or {}
            
            return {
                'success': True,
                'file_id': str(file_id),
                'filename': grid_out.filename,
                'size': grid_out.length,
                'uploaded_at': metadata.get('uploaded_at'),
                'mime_type': metadata.get('mime_type'),
                'user_id': metadata.get('user_id'),
                'category': metadata.get('file_category')
            }
        
        except NoFile:
            return {'success': False, 'error': 'File not found'}
        except Exception as e:
            log.error(f"[FILE] ❌ Get info error: {e}")
            return {'success': False, 'error': str(e)}
    
    @staticmethod
    def list_user_files(user_id, file_category=None, limit=20):
        """
        List all files uploaded by a user
        
        Args:
            user_id (int): User ID
            file_category (str): Optional filter by category
            limit (int): Max number of files to return
        
        Returns:
            dict: {'success': bool, 'files': [...], 'error': str}
        """
        try:
            db = get_mongodb().get_db()
            
            # Build query
            query = {'metadata.user_id': user_id}
            if file_category:
                query['metadata.file_category'] = file_category
            
            # Query files collection
            files = db['fs.files'].find(query).limit(limit).sort('uploadDate', -1)
            
            result = []
            for file_doc in files:
                metadata = file_doc.get('metadata', {})
                result.append({
                    'file_id': str(file_doc['_id']),
                    'filename': file_doc.get('filename'),
                    'size': file_doc.get('length'),
                    'uploaded_at': file_doc.get('uploadDate'),
                    'category': metadata.get('file_category'),
                    'mime_type': metadata.get('mime_type')
                })
            
            log.info(f"[FILE] ✅ Listed {len(result)} files for user {user_id}")
            return {'success': True, 'files': result}
        
        except Exception as e:
            log.error(f"[FILE] ❌ List files error: {e}")
            return {'success': False, 'error': str(e)}
    
    @staticmethod
    def list_channel_files(channel_id, limit=50):
        """List all files uploaded to a specific channel"""
        try:
            db = get_mongodb().get_db()
            
            query = {'metadata.channel_id': channel_id}
            files = db['fs.files'].find(query).limit(limit).sort('uploadDate', -1)
            
            result = []
            for file_doc in files:
                metadata = file_doc.get('metadata', {})
                result.append({
                    'file_id': str(file_doc['_id']),
                    'filename': file_doc.get('filename'),
                    'size': file_doc.get('length'),
                    'uploaded_at': file_doc.get('uploadDate'),
                    'user_id': metadata.get('user_id'),
                    'mime_type': metadata.get('mime_type')
                })
            
            return {'success': True, 'files': result}
        
        except Exception as e:
            log.error(f"[FILE] ❌ List channel files error: {e}")
            return {'success': False, 'error': str(e)}
```

### Step 6: Create File Upload Routes

Create `Backend/routes/files.py`:

```python
"""
File Upload & Download Routes
Handles file operations via REST API
"""

from flask import Blueprint, request, jsonify, send_file
from flask_jwt_extended import jwt_required, get_jwt_identity
from services.file_service import FileUploadService
from database import get_db_connection
from werkzeug.exceptions import RequestEntityTooLarge
import logging
import io

log = logging.getLogger(__name__)

files_bp = Blueprint('files', __name__, url_prefix='/api/files')


def get_user_id_from_username(username):
    """Helper: Get user ID from username"""
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            user = cur.fetchone()
            return user['id'] if user else None
    finally:
        conn.close()


# =====================================
# FILE UPLOAD
# =====================================

@files_bp.route('/upload', methods=['POST'])
@jwt_required()
def upload_file():
    """
    Upload a file to MongoDB GridFS
    
    Form Data:
        - file: FileStorage object (required)
        - category: str (optional) - message|avatar|document
        - message_id: int (optional)
        - channel_id: int (optional)
    
    Response:
        {
            'success': bool,
            'file_id': str,
            'filename': str,
            'size': int,
            'url': str,
            'mime_type': str
        }
    """
    try:
        username = get_jwt_identity()
        
        # Validate file exists
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        
        # Get optional parameters
        file_category = request.form.get('category', 'general')
        message_id = request.form.get('message_id', type=int)
        channel_id = request.form.get('channel_id', type=int)
        
        # Build metadata
        metadata = {}
        if message_id:
            metadata['message_id'] = message_id
        if channel_id:
            metadata['channel_id'] = channel_id
        
        # Get user ID
        user_id = get_user_id_from_username(username)
        if not user_id:
            return jsonify({'error': 'User not found'}), 404
        
        # Upload file
        result = FileUploadService.upload_file(
            file=file,
            user_id=user_id,
            file_category=file_category,
            metadata=metadata
        )
        
        if result['success']:
            return jsonify(result), 200
        else:
            return jsonify(result), 400
    
    except RequestEntityTooLarge:
        return jsonify({'error': 'File too large'}), 413
    except Exception as e:
        log.error(f"[FILES] Upload error: {e}")
        return jsonify({'error': 'Upload failed'}), 500


# =====================================
# FILE DOWNLOAD
# =====================================

@files_bp.route('/download/<file_id>', methods=['GET'])
@jwt_required()
def download_file(file_id):
    """Download file from GridFS as attachment"""
    try:
        result = FileUploadService.download_file(file_id)
        
        if result['success']:
            return send_file(
                io.BytesIO(result['file_data']),
                mimetype=result['mime_type'],
                as_attachment=True,
                download_name=result['filename']
            )
        else:
            return jsonify({'error': result['error']}), 404
    
    except Exception as e:
        log.error(f"[FILES] Download error: {e}")
        return jsonify({'error': 'Download failed'}), 500


# =====================================
# FILE PREVIEW (inline display)
# =====================================

@files_bp.route('/preview/<file_id>', methods=['GET'])
@jwt_required()
def preview_file(file_id):
    """Get file for inline preview (images, PDFs, etc.)"""
    try:
        result = FileUploadService.download_file(file_id)
        
        if result['success']:
            return send_file(
                io.BytesIO(result['file_data']),
                mimetype=result['mime_type']
            )
        else:
            return jsonify({'error': result['error']}), 404
    
    except Exception as e:
        log.error(f"[FILES] Preview error: {e}")
        return jsonify({'error': 'Preview failed'}), 500


# =====================================
# FILE DELETE
# =====================================

@files_bp.route('/delete/<file_id>', methods=['DELETE'])
@jwt_required()
def delete_file(file_id):
    """Delete a file from GridFS (only uploader can delete)"""
    try:
        username = get_jwt_identity()
        user_id = get_user_id_from_username(username)
        
        if not user_id:
            return jsonify({'error': 'User not found'}), 404
        
        result = FileUploadService.delete_file(file_id, user_id)
        
        if result['success']:
            return jsonify({'message': 'File deleted'}), 200
        else:
            return jsonify({'error': result['error']}), 400
    
    except Exception as e:
        log.error(f"[FILES] Delete error: {e}")
        return jsonify({'error': 'Delete failed'}), 500


# =====================================
# GET FILE INFO
# =====================================

@files_bp.route('/info/<file_id>', methods=['GET'])
@jwt_required()
def get_file_info(file_id):
    """Get file metadata without downloading"""
    try:
        result = FileUploadService.get_file_info(file_id)
        
        if result['success']:
            return jsonify(result), 200
        else:
            return jsonify({'error': result['error']}), 404
    
    except Exception as e:
        log.error(f"[FILES] Get info error: {e}")
        return jsonify({'error': 'Failed to get file info'}), 500


# =====================================
# LIST USER FILES
# =====================================

@files_bp.route('/list', methods=['GET'])
@jwt_required()
def list_user_files():
    """
    List all files uploaded by current user
    
    Query Params:
        - category: str (optional)
        - limit: int (default: 20)
    """
    try:
        username = get_jwt_identity()
        user_id = get_user_id_from_username(username)
        
        if not user_id:
            return jsonify({'error': 'User not found'}), 404
        
        file_category = request.args.get('category')
        limit = request.args.get('limit', 20, type=int)
        
        result = FileUploadService.list_user_files(user_id, file_category, limit)
        
        if result['success']:
            return jsonify(result), 200
        else:
            return jsonify({'error': result['error']}), 500
    
    except Exception as e:
        log.error(f"[FILES] List error: {e}")
        return jsonify({'error': 'Failed to list files'}), 500


# =====================================
# LIST CHANNEL FILES
# =====================================

@files_bp.route('/channel/<int:channel_id>', methods=['GET'])
@jwt_required()
def list_channel_files(channel_id):
    """List all files uploaded to a specific channel"""
    try:
        limit = request.args.get('limit', 50, type=int)
        
        result = FileUploadService.list_channel_files(channel_id, limit)
        
        if result['success']:
            return jsonify(result), 200
        else:
            return jsonify({'error': result['error']}), 500
    
    except Exception as e:
        log.error(f"[FILES] List channel error: {e}")
        return jsonify({'error': 'Failed to list channel files'}), 500
```

### Step 7: Update `app.py`

Add file upload blueprint to your main Flask app:

```python
# At the top with other imports
from routes.files import files_bp

# In your app initialization section, add:
app.register_blueprint(files_bp)

# Also update CORS to allow file uploads
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max
```

### Step 8: Update `requirements.txt`

Add these lines to `Backend/requirements.txt`:

```txt
Flask
Flask-JWT-Extended
Flask-Cors
python-dotenv
PyMySQL
bcrypt
Werkzeug
flask_socketio
Pillow
pymongo==3.12.3
gridfs
python-multipart
```

---

## Frontend Implementation

### FileUploadButton Component

Create `Frontend/src/components/FileUploadButton.tsx`:

```typescript
import React, { useRef, useState } from 'react';
import { Upload, File, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

interface FileUploadProps {
  onFileUpload?: (fileData: any) => void;
  category?: 'message' | 'avatar' | 'document' | 'general';
  maxSize?: number;
  accept?: string;
  channelId?: number;
  messageId?: number;
}

export default function FileUploadButton({ 
  onFileUpload, 
  category = 'message',
  maxSize = 50 * 1024 * 1024,
  accept = '.pdf,.doc,.docx,.jpg,.jpeg,.png,.mp4,.mp3',
  channelId,
  messageId
}: FileUploadProps) {
  const { isDarkMode } = useTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size
    if (file.size > maxSize) {
      setError(`File too large. Max size: ${maxSize / 1024 / 1024}MB`);
      return;
    }

    setUploading(true);
    setError(null);
    setSuccess(null);
    setProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('category', category);
      
      if (channelId) formData.append('channel_id', channelId.toString());
      if (messageId) formData.append('message_id', messageId.toString());

      const token = localStorage.getItem('token');

      const response = await fetch('/api/files/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(`Uploaded: ${data.filename}`);
        onFileUpload?.(data);
        
        // Clear success message after 3 seconds
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(data.error || 'Upload failed');
      }
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileSelect}
        accept={accept}
        disabled={uploading}
        className="hidden"
      />

      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className={`p-2 rounded-lg transition-colors ${
          uploading
            ? 'cursor-not-allowed opacity-50'
            : `hover:${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`
        }`}
        title="Upload file"
      >
        {uploading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <Upload className="w-5 h-5" />
        )}
      </button>

      {error && (
        <div className="flex items-center gap-2 text-red-600 text-sm animate-fade-in">
          <AlertCircle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 text-green-600 text-sm animate-fade-in">
          <CheckCircle className="w-4 h-4" />
          <span>{success}</span>
        </div>
      )}
    </div>
  );
}
```

### FileViewer Component

Create `Frontend/src/components/FileViewer.tsx`:

```typescript
import React, { useState } from 'react';
import { Download, Eye, Trash2, Loader2 } from 'lucide-react';

interface FileViewerProps {
  fileId: string;
  filename: string;
  size: number;
  mimeType: string;
  onDelete?: (fileId: string) => void;
}

export default function FileViewer({
  fileId,
  filename,
  size,
  mimeType,
  onDelete
}: FileViewerProps) {
  const [deleting, setDeleting] = useState(false);
  const token = localStorage.getItem('token');

  const isImage = mimeType.startsWith('image/');
  const isPDF = mimeType === 'application/pdf';
  const isVideo = mimeType.startsWith('video/');
  const isAudio = mimeType.startsWith('audio/');

  const handleDelete = async () => {
    if (!confirm('Delete this file?')) return;

    setDeleting(true);
    try {
      const response = await fetch(`/api/files/delete/${fileId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        onDelete?.(fileId);
      }
    } catch (err) {
      alert('Failed to delete file');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="border rounded-lg p-4 flex items-center justify-between">
      <div className="flex-1">
        <p className="font-semibold">{filename}</p>
        <p className="text-sm text-gray-500">
          {(size / 1024).toFixed(2)} KB
        </p>
      </div>

      <div className="flex gap-2">
        {(isImage || isPDF) && (
          <a
            href={`/api/files/preview/${fileId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 hover:bg-gray-200 rounded-lg"
            title="Preview"
          >
            <Eye className="w-5 h-5" />
          </a>
        )}

        <a
          href={`/api/files/download/${fileId}`}
          className="p-2 hover:bg-gray-200 rounded-lg"
          title="Download"
        >
          <Download className="w-5 h-5" />
        </a>

        <button
          onClick={handleDelete}
          disabled={deleting}
          className="p-2 hover:bg-red-100 rounded-lg text-red-600"
          title="Delete"
        >
          {deleting ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Trash2 className="w-5 h-5" />
          )}
        </button>
      </div>
    </div>
  );
}
```

---

## Database Schema

### MongoDB Collections Created by GridFS

GridFS automatically creates two collections:

```javascript
// fs.files - Stores file metadata
db.createCollection('fs.files');

// fs.chunks - Stores file chunks (255KB each)
db.createCollection('fs.chunks');

// Example document in fs.files:
{
  _id: ObjectId("..."),
  length: 2048576,
  chunkSize: 261120,
  uploadDate: ISODate("2026-01-26T10:30:00.000Z"),
  filename: "document.pdf",
  metadata: {
    user_id: 42,
    original_filename: "document.pdf",
    file_category: "document",
    file_size: 2048576,
    mime_type: "application/pdf",
    uploaded_at: ISODate("2026-01-26T10:30:00.000Z"),
    message_id: 123,
    channel_id: 456
  }
}
```

---

## API Endpoints

### Complete API Reference

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/files/upload` | POST | ✅ | Upload file to GridFS |
| `/api/files/download/<file_id>` | GET | ✅ | Download file as attachment |
| `/api/files/preview/<file_id>` | GET | ✅ | Preview file inline |
| `/api/files/delete/<file_id>` | DELETE | ✅ | Delete file from GridFS |
| `/api/files/info/<file_id>` | GET | ✅ | Get file metadata |
| `/api/files/list` | GET | ✅ | List user's files |
| `/api/files/channel/<channel_id>` | GET | ✅ | List channel's files |

---

## Testing

### Test File Upload

```bash
# Get a token first
curl -X POST http://localhost:5000/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"password"}'

# Copy the token, then upload a file
curl -X POST http://localhost:5000/api/files/upload \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -F "file=@/path/to/test.pdf" \
  -F "category=document"
```

### Expected Response

```json
{
  "success": true,
  "file_id": "65b4a1c2d7f8e9a0b1c2d3e4",
  "filename": "test.pdf",
  "size": 2048576,
  "url": "/api/files/download/65b4a1c2d7f8e9a0b1c2d3e4",
  "mime_type": "application/pdf"
}
```

---

## Troubleshooting

### MongoDB Connection Issues

**Problem:** `ConnectionFailure: connection refused`

**Solution:**
```bash
# Windows - Start MongoDB
mongod

# Linux/Mac
brew services start mongodb-community

# Check if running
mongo --eval "db.adminCommand('ping')"
```

### File Upload Size Limits

**Problem:** File upload fails with "file too large"

**Solution:**
1. Update `MAX_FILE_SIZE` in `.env`
2. Update Flask config: `app.config['MAX_CONTENT_LENGTH']`
3. Restart Flask server

### GridFS Not Initializing

**Problem:** `GridFS initialization error`

**Solution:**
```python
# Make sure MongoDB is connected first
from services.mongodb_service import get_mongodb
mongo = get_mongodb()
print(mongo.is_connected())  # Should return True
```

### File Not Found Error

**Problem:** `NoFile: no file in gridfs with _id`

**Solution:**
- Check file_id is correct ObjectId format
- Verify file exists: `db.fs.files.findOne({_id: ObjectId("id")})`
- Check file wasn't deleted

---

## Best Practices

### Security

✅ **Always validate file types**
```python
ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'png', 'doc', 'docx']
```

✅ **Enforce file size limits**
```python
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
```

✅ **Verify user ownership**
```python
def delete_file(file_id, user_id):
    file_doc = fs.get(file_id)
    if file_doc.metadata['user_id'] != user_id:
        raise PermissionError()
```

✅ **Use secure filenames**
```python
from werkzeug.utils import secure_filename
filename = secure_filename(file.filename)
```

### Performance

✅ **Use indexes for faster queries**
```javascript
db['fs.files'].createIndex({'metadata.user_id': 1})
db['fs.files'].createIndex({'metadata.channel_id': 1})
db['fs.files'].createIndex({'uploadDate': -1})
```

✅ **Limit chunk size for small files**
```python
# Default 255KB is good for most cases
# Don't decrease below 16KB
```

✅ **Clean up old files**
```python
# Delete files older than 30 days
import datetime
cutoff = datetime.datetime.utcnow() - datetime.timedelta(days=30)
db['fs.files'].delete_many({'uploadDate': {'$lt': cutoff}})
```

### Monitoring

✅ **Track file sizes**
```python
# Get total storage used
db['fs.chunks'].aggregate([
    {'$group': {'_id': None, 'total': {'$sum': '$data'}}}
])
```

✅ **Monitor upload errors**
```python
log.info(f"[FILE] Upload success: {filename}")
log.error(f"[FILE] Upload failed: {error}")
```

---

## Next Steps

1. **Integrate with Messages:** Add file_id to messages table
2. **Add virus scanning:** Scan files before storing
3. **Implement caching:** Use Redis for file metadata
4. **Add compression:** Compress files before storage
5. **Enable quotas:** Limit storage per user

---

**Document Complete!** 

For questions or updates, refer to MongoDB GridFS documentation:
https://docs.mongodb.com/manual/core/gridfs/

