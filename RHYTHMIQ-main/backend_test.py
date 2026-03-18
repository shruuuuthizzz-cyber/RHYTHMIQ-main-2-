#!/usr/bin/env python3
"""
RHYTHMIQ Backend API Testing Suite
Tests all backend API endpoints using the public endpoint.
"""

import requests
import sys
import json
import time
from datetime import datetime

class RhythmiqAPITester:
    def __init__(self):
        self.base_url = "https://smooth-animated-app.preview.emergentagent.com/api"
        self.token = None
        self.user_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []
        
    def log_test(self, name, success, message="", response_data=None):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name}: {message}")
        else:
            print(f"❌ {name}: {message}")
        
        self.test_results.append({
            "test": name,
            "success": success,
            "message": message,
            "response_data": response_data
        })
        
    def run_test(self, name, method, endpoint, expected_status, data=None, use_auth=False):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        headers = {'Content-Type': 'application/json'}
        
        if use_auth and self.token:
            # Add token as query parameter as required by the API
            url += f"?authorization=Bearer {self.token}" if "?" not in url else f"&authorization=Bearer {self.token}"
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=30)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=30)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=30)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=30)
            else:
                raise ValueError(f"Unsupported method: {method}")
            
            success = response.status_code == expected_status
            response_data = None
            
            try:
                response_data = response.json()
            except:
                response_data = {"raw_response": response.text}
            
            message = f"Status: {response.status_code}"
            if not success:
                message += f" (expected {expected_status})"
                if response_data:
                    message += f" - {response_data.get('detail', str(response_data)[:100])}"
            
            self.log_test(name, success, message, response_data)
            return success, response_data
            
        except Exception as e:
            self.log_test(name, False, f"Exception: {str(e)}")
            return False, {}

    def test_root_endpoint(self):
        """Test root API endpoint"""
        return self.run_test("API Root", "GET", "/", 200)

    def test_auth_register(self):
        """Test user registration"""
        timestamp = int(time.time())
        test_data = {
            "username": f"testuser_{timestamp}",
            "email": f"test_{timestamp}@rhythmiq.test",
            "password": "test123456"
        }
        
        success, response = self.run_test(
            "User Registration", 
            "POST", 
            "/auth/register", 
            200, 
            test_data
        )
        
        if success and response.get('token'):
            self.token = response['token']
            if 'user' in response:
                self.user_id = response['user'].get('id')
        
        return success

    def test_auth_login_existing_user(self):
        """Test login with existing demo user"""
        test_data = {
            "email": "demo@rhythmiq.com",
            "password": "demo123"
        }
        
        success, response = self.run_test(
            "Login Existing User", 
            "POST", 
            "/auth/login", 
            200, 
            test_data
        )
        
        return success

    def test_auth_me(self):
        """Test get current user info"""
        return self.run_test(
            "Get User Info", 
            "GET", 
            "/auth/me", 
            200, 
            use_auth=True
        )

    def test_spotify_search(self):
        """Test Spotify search with fallback data"""
        return self.run_test(
            "Spotify Search", 
            "GET", 
            "/spotify/search?q=test&type=track&limit=5", 
            200
        )

    def test_spotify_track(self):
        """Test get track details"""
        return self.run_test(
            "Get Track Details", 
            "GET", 
            "/spotify/track/sample_track_1", 
            200
        )

    def test_spotify_artist(self):
        """Test get artist details"""
        return self.run_test(
            "Get Artist Details", 
            "GET", 
            "/spotify/artist/sample_artist_1", 
            200
        )

    def test_spotify_album(self):
        """Test get album details"""
        return self.run_test(
            "Get Album Details", 
            "GET", 
            "/spotify/album/sample_album_1", 
            200
        )

    def test_time_suggestions(self):
        """Test time-of-day suggestions"""
        return self.run_test(
            "Time Suggestions", 
            "GET", 
            "/suggestions/time-of-day?hour=14&limit=10", 
            200
        )

    def test_playlist_create(self):
        """Test playlist creation"""
        test_data = {
            "name": f"Test Playlist {int(time.time())}",
            "description": "Test playlist for API testing",
            "is_public": True
        }
        
        success, response = self.run_test(
            "Create Playlist", 
            "POST", 
            "/playlists", 
            200, 
            test_data,
            use_auth=True
        )
        
        if success and response.get('id'):
            self.test_playlist_id = response['id']
        
        return success

    def test_playlist_list(self):
        """Test get user playlists"""
        return self.run_test(
            "List Playlists", 
            "GET", 
            "/playlists", 
            200,
            use_auth=True
        )

    def test_likes_toggle(self):
        """Test toggle like for a track"""
        test_data = {
            "spotify_track_id": "sample_track_1",
            "track_name": "Test Track",
            "artist_name": "Test Artist"
        }
        
        return self.run_test(
            "Toggle Like", 
            "POST", 
            "/likes/toggle", 
            200, 
            test_data,
            use_auth=True
        )

    def test_likes_list(self):
        """Test get user likes"""
        return self.run_test(
            "Get Likes", 
            "GET", 
            "/likes", 
            200,
            use_auth=True
        )

    def test_rating_set(self):
        """Test set track rating"""
        test_data = {
            "spotify_track_id": "sample_track_1",
            "stars": 4,
            "track_name": "Test Track",
            "artist_name": "Test Artist"
        }
        
        return self.run_test(
            "Set Rating", 
            "POST", 
            "/ratings", 
            200, 
            test_data,
            use_auth=True
        )

    def test_music_dna(self):
        """Test get music DNA"""
        return self.run_test(
            "Get Music DNA", 
            "GET", 
            "/dna", 
            200,
            use_auth=True
        )

    def test_lyra_chat(self):
        """Test LYRA AI chat"""
        test_data = {
            "message": "Hello LYRA, recommend me some good music!"
        }
        
        print("⏳ Testing LYRA AI (may take 10-15 seconds)...")
        return self.run_test(
            "LYRA AI Chat", 
            "POST", 
            "/lyra/chat", 
            200, 
            test_data,
            use_auth=True
        )

    def test_song_deep_dive(self):
        """Test song deep dive features"""
        return self.run_test(
            "Song Deep Dive", 
            "GET", 
            "/song-dive/sample_track_1", 
            200
        )

    def run_all_tests(self):
        """Run all API tests"""
        print("🚀 Starting RHYTHMIQ Backend API Tests")
        print(f"🌐 Testing against: {self.base_url}")
        print("="*60)
        
        # Test basic connectivity
        self.test_root_endpoint()
        
        # Test authentication
        if self.test_auth_register():
            self.test_auth_me()
        
        # Test existing user login
        self.test_auth_login_existing_user()
        
        # Test Spotify proxy endpoints (should use fallback data)
        self.test_spotify_search()
        self.test_spotify_track()
        self.test_spotify_artist()
        self.test_spotify_album()
        
        # Test suggestions
        self.test_time_suggestions()
        
        # Test authenticated endpoints
        if self.token:
            self.test_playlist_create()
            self.test_playlist_list()
            self.test_likes_toggle()
            self.test_likes_list()
            self.test_rating_set()
            self.test_music_dna()
            self.test_song_deep_dive()
            
            # Test LYRA AI last as it may take longer
            self.test_lyra_chat()
        
        # Print summary
        print("\n" + "="*60)
        print(f"📊 Test Results: {self.tests_passed}/{self.tests_run} tests passed")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All tests passed!")
        else:
            print("⚠️  Some tests failed. Check logs above for details.")
            
        return self.tests_passed == self.tests_run

def main():
    tester = RhythmiqAPITester()
    success = tester.run_all_tests()
    
    # Save results to JSON for reporting
    with open('/tmp/backend_test_results.json', 'w') as f:
        json.dump({
            'timestamp': datetime.now().isoformat(),
            'base_url': tester.base_url,
            'total_tests': tester.tests_run,
            'passed_tests': tester.tests_passed,
            'success_rate': round(tester.tests_passed / tester.tests_run * 100, 1),
            'results': tester.test_results
        }, f, indent=2)
    
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())