FROM node:latest

RUN npm install forever -g
ADD application /application
WORKDIR /application
RUN npm install
EXPOSE 9010

ADD upload_partial /usr/bin/

CMD forever app.js
