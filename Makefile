all : build

build :
	@cat $(shell find components -name 'component.yml') > docker-compose.yml
	docker-compose build

clean :
	@rm docker-compose.yml
	docker-compose stop

running :
	@docker ps --format '{{.Names}}'
	@docker ps --format '{{.Names}}' | wc -l

run : build
	docker-compose up -d
	@sleep 1
	-@rm -f .failed.debug
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
	$(shell docker ps -a --format '{{.Names}}\t{{.Status}}' \
	   | grep $$(basename $$PWD) \
	   | grep 'Exited' \
	   | awk -F \t '{print $$1}' > .failed.debug)
else
	@echo Success
endif

inspect :
	$(shell echo '' > .failed.debug)
	$(shell docker ps -a --format '{{.Names}}\t{{.Status}}' \
	   | grep $$(basename $$PWD) \
	   | grep 'Exited' \
	   | awk -F \t '{print $$1}' > .failed.debug)
	xargs docker logs < .failed.debug 2>&1 | less



kill :
	docker-compose kill
