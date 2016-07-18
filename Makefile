all : build

build :
	@cat $(shell find components -name 'component.yml') > docker-compose.yml
	docker-compose build

clean :
	@rm docker-compose.yml
	docker-compose stop

run :
	docker-compose up -d
	@sleep 1
	$(eval R = $(shell cat docker-compose.yml \
	   | grep '^[a-zA-Z0-9]' \
	   | wc -l \
	   | tr -d ' '))
	$(eval D = $(shell docker ps \
	   | grep $$(basename $$PWD) \
	   | wc -l \
	   | tr -d ' '))
	@echo $(D)/$(R) containers running
ifneq ($(D), $(R))
	@echo Success
else
	$(shell docker ps -a --format '{{.Names}}\t{{.Status}}' \
	   | grep $$(basename $$PWD) \
	   | grep 'Exited' \
	   | awk -F \t '{print $$1}' > .failed.debug)
endif

kill :
	docker-compose kill
