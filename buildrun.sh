docker compose down
docker compose build backend --no-cache
docker compose up  -d

cd frontend && npm run build && cd ..

