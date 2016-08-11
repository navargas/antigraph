FROM centos:centos7
ADD docker.repo /etc/yum.repos.d/

RUN yum install docker-engine -y
RUN bash -c 'curl --silent --location https://rpm.nodesource.com/setup_4.x | bash -'
RUN yum install nodejs npm -y
