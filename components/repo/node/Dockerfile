FROM node:latest

RUN apt-get update -y && apt-get install postgresql-client -y
ADD application /application
WORKDIR /application
#RUN npm install
EXPOSE 9010
CMD npm start
