FROM node:latest

RUN apt-get update -y && apt-get install postgresql-client -y
ADD application /application
WORKDIR /application
RUN npm install
EXPOSE 80
CMD npm start
