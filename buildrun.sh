cd backend
docker compose down
docker compose build backend --no-cache
docker compose up  -d
cd ..

cd frontend && npm run build && cd ..

