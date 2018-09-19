FROM node:10-alpine
COPY . /app
WORKDIR /app
RUN npx ts-node --files ./node_modules/.bin/typeorm --config=./src/config/pg.ts migration:run
CMD ["npx", "ts-node", "--files", "src/main.ts"]
