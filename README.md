# Cumulus Repo V2 Beta

Main node hosted at https://svl.cumulusrepo.com

* [Mirrors](#current-mirrors)
* [Create Key](#create-key)
* [Using Docker Images](#docker)
* [Using Files](#binary-assets)
* [Delete Assets](#delete)
* [Transfer Assets](#transfer)
* [Named Keys](#named-keys)

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
repo_download:
     asset: {{ asset }}
     version: {{ version }}
     region: {{ region }}     # na, we, ea, cdsdev, or svl
     key: {{ key }}
```
**Note:** repo_download.py can be downloaded from [here](https://github.ibm.com/cds-sre-org/cumulus_ansible/blob/master/.modules/repo_download.py). This module requires `wget` to be installed
on the target machine. Optional aguments `checksum` and `dest` can also be provided, where `checksum`
matches the format "md5:347d3060b8f0366c0eb06df61c9b1f74" and `dest` is either a directory or filename.

The old "assets" command line tool will also work for uploading/downloading files.
```bash
assets fetch assetName:versionName
```

# Delete

Versions can either be deleted with the trash icon on the UI, or with curl:
```bash
curl -H 'X-API-KEY: key_goes_here' -H "Content-Type: application/json" -d \
    '{"asset":"assetName",
      "version":"assetVersion",
      "delete":true,
      "service":"Binary Repo",
      "source":"North America"}' \
    https://svl.cumulusrepo.com/transfers
```

# Transfer
Versions can either be transfered with the "transfer" button on the UI,
or with curl:
```bash
curl -H 'X-API-KEY: key_goes_here' -H "Content-Type: application/json" -d \
    '{"asset":"assetName",
      "version":"assetVersion",
      "service":"Binary Repo",
      "source":"North America",
      "target":"Western Europe"}' \
    https://svl.cumulusrepo.com/transfers
```

# Named Keys

Named keys can be used to give partial, readonly access to a chosen set of assets.

**Note:** `:service:` denotes whether you are whitelisting assets for Docker Registry
or Binary Repo. This parameter is case insensitive and need not match trailing
characters, so `/keys/MyNewKey/whitelist/docker/` is the same as
`/keys/MyNewKey/whitelist/Docker%20Registry/` and likewise
`/keys/MyNewKey/whitelist/binary/` can be used instead of
`/keys/MyNewKey/whitelist/Binary%20Repo/`.

**Note:** Key metadata is cached for up to 10 minutes. The /keys/ interface will
always show the most recent data, but changes might not take effect immediately.

**GET /keys/**
 * Return a list of all named keys that belong to the team
 * example result:
```json
[
	{"name":"SpecialKey1", "description":"This is a key"},
	{"name":"SpecialKey2", "description":"This is another key"}
]
```

**PUT /keys/:name:/**
* Create a named key. By default the key would be readonly with no access to any assets

**DELETE /keys/:name:/**
* Delete a named key

**GET /keys/:name:/**
 * Retrieve info about key with name "name"
 * example result:
```json
{
	"name":"SpecialKey1",
	"description":"This key was created as an example",
	"value":"secretabcdef",
	"whitelist":{"Docker Repo":["asset1", "asset2"], "Binary Assets":["asset1","asset2"]}
}
```

**POST /keys/:name:/whitelist/:service:/:assetName:/**
* Add an asset to the key's whitelist

**DELETE /keys/:name:/whitelist/:service:/:assetName:/**
* Remove an asset from the key's whitelist


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
