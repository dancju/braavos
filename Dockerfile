FROM node:10-alpine
COPY . /app
WORKDIR /app
RUN yarn
RUN yarn postinstall
RUN yarn prestart:prod
CMD ["yarn", "start:prod"]
