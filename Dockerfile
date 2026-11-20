# Optional: run the game in a container.  docker build -t dao-den-long . && docker run -p 8080:8080 -v ddl-data:/app/data dao-den-long
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
ENV HOST=0.0.0.0 PORT=8080
EXPOSE 8080
CMD ["node", "scripts/serve.js"]
