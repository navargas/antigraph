# Cumulus Repo V2 Beta

Main node hosted at https://svl.cumulusrepo.com

## Current Mirrors

You can upload files and docker images to any of the URLs listed below, but keep in mind that Cumulus Repo cannot yet transfer files *into* the IBM network. Fox example, if you upload a file initially to North America (na), it can only be transferred to Western Europe (we) or East Asia (ea), but not SVL.

| Location       | URL                    | Notes                                             |
|----------------|------------------------|---------------------------------------------------|
| San Jose SVL   |    svl.cumulusrepo.com | Cannot receive files from outside the IBM network |
| CDS Dev        | cdsdev.cumulusrepo.com | Cannot receive files from outside the IBM network |
| Western Europe |     we.cumulusrepo.com | Located in London (lon02)                         |
| East Asia      |     ea.cumulusrepo.com | Located in Singapore (sng01)                      |
| North America  |     na.cumulusrepo.com | Located in Dallas (dal09)                         |

## Create Key
First visit https://svl.cumulusrepo.com and enter in a Intranet ID/Password.
Then you can select or create a team and an API key will be created.

## Docker
```bash
docker login svl.cumulusrepo.com
# Username should be "token" and password will be the API key you generate
docker tag svl.cumulusrepo.com/teamName/yourImage:versionName
docker push svl.cumulusrepo.com/teamName/yourImage:versionName
```
Replace teamName, yourImage, versionName with the correct values.

## Binary Assets
```bash
curl -v -s -H "X-API-KEY: key" -F "upload=@PATH_TO_FILE" https://svl.cumulusrepo.com/assets/assetName/assetVersion/
```
Replace key, PATH_TO_FILE, assetName, and assetVersion with the correct values.

The old "assets" command line tool will also work for uploading files.


# Development

### Requirements

To start a local instance of Cumulus Repo V2 you will need:
- docker (recent version)
- docker-compose (recent version)

Docker must be running locally (i.e. the default configuration with a /var/run/docker.sock file).
Otherwise the coordinator component will not be able to run docker operations such as push and pull.

### Instructions

- Create a .env file in the root directory with the following contents
```cfg
CLOUDANT_ACCOUNT=Cloudant account name
CLOUDANT_PASSWORD=Cloudant password
GEO=localhost/My Machine
DEBUG=no
THISNODE=localhost
SERVICES=repo_adapter/Binary Repo+registry_adapter/Docker Registry
```
- Replace CLOUDANT_ACCOUNT and CLOUDANT_PASSWORD with the correct values
- run `make run`

### Configuration

The GEO property in `.env` describes the cluster. Each entry is separated by a `+` and contains 2-3 components separated by a forward slash. For example `localhost/My Machine+na.cumulusrepo.com/North America/ssl` describes two machines, one named "My Machine" with a domain name "localhost", and another "North America" with a domain name na.cumulusrepo.com that should be accessed with encryption.
