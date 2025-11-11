# API Test Results ✅

## Test Date: 2025-11-11

### Server Status
- ✅ Server running on: `http://localhost:10001`
- ✅ CORS configured for: `https://q-gongcha.thanvasupos.com`

---

## Test 1: Health Check ✅
**Endpoint:** `GET /health`

```bash
curl http://localhost:10001/health
```

**Response:**
```json
{
  "status": "OK",
  "message": "Queue Management API is running",
  "timestamp": "2025-11-11T09:07:26.416Z"
}
```

---

## Test 2: Login - Get JWT Token ✅
**Endpoint:** `POST /api/queue/login`

**Request:**
```json
{
  "RestID": "1"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "restaurantInfo": {
      "RestID": 1,
      "RestName": "Gongcha CTW"
    },
    "expiresIn": "24h"
  },
  "timestamp": "2025-11-11T09:07:16.434Z"
}
```

---

## Test 3: Execute with JWT ✅
**Endpoint:** `POST /api/queue/execute-jwt`

**Request:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "QueStatus": "ALL"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalRecords": 1,
    "queueData": [...]
  }
}
```

---

## PowerShell Test Commands

### 1. Health Check
```powershell
Invoke-RestMethod -Uri "http://localhost:10001/health" -Method GET
```

### 2. Login
```powershell
$body = @{ RestID = "1" } | ConvertTo-Json
$response = Invoke-RestMethod -Uri "http://localhost:10001/api/queue/login" -Method POST -Body $body -ContentType "application/json"
$token = $response.data.token
Write-Host "Token: $token"
```

### 3. Execute with JWT
```powershell
$body = @{ token = $token; QueStatus = "ALL" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:10001/api/queue/execute-jwt" -Method POST -Body $body -ContentType "application/json"
```

---

## Postman Collection
Import `postman-test-login.json` to test all endpoints

---

## Next Steps for Production

1. **Build Docker Image:**
   ```bash
   build-and-push.bat
   ```

2. **Deploy to Server:**
   ```bash
   docker pull thanvasu/q-gongcha:v1.0.21.api
   docker stop q-gongcha-api && docker rm q-gongcha-api
   docker run -d --name q-gongcha-api -p 10001:10001 --restart unless-stopped thanvasu/q-gongcha:v1.0.21.api
   ```

3. **Verify CORS:**
   - Test from `https://q-gongcha.thanvasupos.com`
   - Check browser console for CORS errors
   - Verify `Access-Control-Allow-Origin` header in response

---

## Summary
✅ All endpoints working correctly
✅ JWT authentication working
✅ CORS configured for production domain
✅ Ready for deployment
