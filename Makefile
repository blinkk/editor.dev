project := grow-prod
service := live-edit-server
region := us-central1
tag := latest

build:
	gcloud builds submit \
		--project=$(project)

build-prod:
	gcloud builds submit \
		--project=$(project) \
		--substitutions _GITHUB_REF=${GITHUB_REF} \
		--config=cloudbuild-prod.yaml

build-and-deploy:
	$(MAKE) build
	$(MAKE) deploy

build-and-deploy-prod:
	$(MAKE) build-prod
	$(MAKE) deploy-prod

deploy:
	gcloud run deploy ${service} \
		--project=$(project) \
		--platform managed \
		--labels source=main \
		--region ${region} \
		--allow-unauthenticated \
		--image gcr.io/${project}/live-edit-server:main

deploy-prod:
	gcloud run deploy ${service}-prod \
		--project=$(project) \
		--platform managed \
		--labels source=latest \
		--region ${region} \
		--allow-unauthenticated \
		--image gcr.io/${project}/live-edit-server:${tag}
