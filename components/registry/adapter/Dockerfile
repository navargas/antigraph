FROM navargas/docker:1.12.0n6

RUN npm install forever -g

ADD application /application
WORKDIR /application
RUN npm install

ADD delete_image /usr/bin/

CMD forever app.js
