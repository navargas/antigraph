FROM navargas/docker:1.12.0

RUN npm install forever -g

ADD application /application
WORKDIR /application
RUN npm install

CMD forever app.js
