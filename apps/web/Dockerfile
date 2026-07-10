FROM node:20-slim
WORKDIR /srv
COPY package.json .
RUN npm install
COPY . .
RUN npm run build
CMD ["npm", "start"]
