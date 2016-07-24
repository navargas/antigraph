FROM nginx:1.9.5
RUN apt-get update && apt-get install curl nodejs npm -y
RUN ln -s /usr/bin/nodejs /usr/bin/node
RUN npm install forever -g
ADD nginx.conf /etc/nginx/nginx.conf
ADD application /application
WORKDIR /application
RUN npm install
EXPOSE 9010
CMD ["bash", "-c", "forever -a -l /dev/stdout start app.js & nginx -g \"daemon off;\""]
