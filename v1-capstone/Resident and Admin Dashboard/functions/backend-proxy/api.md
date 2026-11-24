# API Information
backend-proxy

Function URL
https://api.lumi.new/v1/functions/p379626134021566464/backend-proxy
POST JSON payloads to this endpoint.

Headers
{
  "Content-Type": "application/json",
  "Authorization": "Bearer <your-api-key>"
}
- Content-Type: required
- Authorization: bearer token

Request Body
{
  "method": "GET|POST|PUT|DELETE",
  "path": "/api/endpoint",
  "body": {}
}
- method: HTTP method (required)
- path: Backend API path (required)
- body: Request body (optional)

Usage Example (cURL)

curl -X POST "https://api.lumi.new/v1/functions/p379626134021566464/backend-proxy" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-api-key>" \
  -d '{
    "method": "GET",
    "path": "/api/violations/open"
  }'

Environment Variables
- BACKEND_URL: Backend server URL (default: http://localhost:4000)
