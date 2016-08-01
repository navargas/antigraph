FROM node:latest

RUN apt-get update -y && apt-get install postgresql-client -y
RUN npm install forever -g
ADD application /application
WORKDIR /application
RUN npm install
EXPOSE 80
CMD forever app.js
