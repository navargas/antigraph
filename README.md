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

**Note**: `svl.cumulusrepo.com` is only accessable from IBM Intranet.
`we`, `na`, and `ea` can be accessed globally.

`cdsdev` is accessible only from IBM IP addresses.

## Create Key
First visit https://svl.cumulusrepo.com and enter in a Intranet ID/Password.
Then you can select or create a team and an API key will be created.

## Docker

```bash
docker login svl.cumulusrepo.com
# Username should be "token" and password will be the API key you generate
docker tag yourImage:versionName svl.cumulusrepo.com/teamName/yourImage:versionName
docker push svl.cumulusrepo.com/teamName/yourImage:versionName
```
Replace teamName, yourImage, versionName with the correct values.

or with Kubernetes:
```yml
containers:
   - name: containerName
     image: geo.cumulusrepo.com/team/image:version
     # replace geo, team, image, and version with correct values
```
**Note** Kubernetes private registry authentication can be a little unintuitive. It will not read your default "~/.docker/config.json" file as you would expect. Instead you need to copy this file to the root ("/") directory (check https://github.com/kubernetes/kubernetes/issues/10383#issuecomment-145672470 for more info) and modify it so that the contents of "auths" are at the top level. 

Example
```json
{
    "auths": {
        "cdsdev.cumulusrepo.com": {
            "auth": "..."
        }
    }
}
```
in ~/.docker/config.json should become
```json
{
    "cdsdev.cumulusrepo.com": {
        "auth": "..."
    }
}
```
in /.dockercfg

## Binary Assets

### Upload
```bash
curl -v -s -H "X-API-KEY: key" -F "upload=@PATH_TO_FILE" https://svl.cumulusrepo.com/assets/assetName/assetVersion/
```
Replace key, PATH_TO_FILE, assetName, and assetVersion with the correct values.


### Download

With curl:
```bash
curl -O -J -H 'X-API-KEY: key' https://svl.cumulusrepo.com/assets/assetName/versionName/
```
Or ansible:
```yml
cumulus_repo:
  asset: assetName
  region: na
  version: versionName
  key: "{{ api_key }}"
  dest: path/to/destination
```
The old "assets" command line tool will also work for uploading/downloading files.
```bash
assets fetch assetName:versionName
```

### Delete
With curl:
```bash
curl -H 'X-API-KEY: key_goes_here' -H "Content-Type: application/json" -d \
    '{"asset":"assetName",
      "version":"assetVersion",
      "delete":true,
      "service":"Binary Repo",
      "source":"North America"}' \
    https://svl.cumulusrepo.com/transfers
```

# Development

*Behind the scenes info. You can ignore this section if you are just using Cumulus Repo.*

![Diagram](http://i.imgur.com/oS7wQhk.png)

### Requirements

To start a local instance of Cumulus Repo V2 you will need:
- docker (recent version)
- docker-compose (recent version)

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
