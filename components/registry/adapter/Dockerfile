FROM navargas/docker

RUN npm install forever -g

ADD application /application
WORKDIR /application
RUN npm install

CMD forever app.js
