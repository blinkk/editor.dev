project := grow-prod
service := live-edit-server
region := us-central1
tag := latest

build:
	gcloud builds submit \
		--project=$(project) \
		--tag gcr.io/${project}/live-edit-server:main

build-prod:
	gcloud builds submit \
		--project=$(project) \
		--tag gcr.io/${project}/live-edit-server:latest

  # Tagged version. Cannot do two --tag in one build... :(
	gcloud builds submit \
	  --async \
		--project=$(project) \
		--tag gcr.io/${project}/live-edit-server:$(subst refs/tags/,,$(GITHUB_REF))

deploy:
	$(MAKE) build
	gcloud run deploy ${service} \
		--project=$(project) \
		--platform managed \
		--labels source=main \
		--region ${region} \
		--allow-unauthenticated \
		--image gcr.io/${project}/live-edit-server:main

deploy-prod:
	$(MAKE) build-prod
	gcloud run deploy ${service}-prod \
		--project=$(project) \
		--platform managed \
		--labels source=latest \
		--region ${region} \
		--allow-unauthenticated \
		--image gcr.io/${project}/live-edit-server:${tag}
