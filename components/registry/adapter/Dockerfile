FROM centos:centos7

RUN bash -c 'curl --silent --location https://rpm.nodesource.com/setup_4.x | bash -'
RUN yum update && yum install nodejs npm docker -y

RUN npm install forever -g

ADD application /application
WORKDIR /application
RUN npm install

CMD forever app.js
