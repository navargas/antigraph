build :
	@cat $(shell find components -name 'component.yml') >> docker-compose.yml
	docker-compose build

clean :
	@rm docker-compose.yml
	docker-compose stop

run : build
	docker-compose up -d

kill :
	docker-compose kill
