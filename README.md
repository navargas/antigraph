# Cumulus Repo V2 Beta

Main node hosted at https://svl.cumulusrepo.com

## Current Mirrors

You can upload files and docker images to any of the URLs listed below, but keep in mind that Cumulus Repo cannot yet transfer files *into* the IBM network. Fox example, if you upload a file initially to North America (na), it can only be transfered to Western Europe (we) or East Asia (ea), but not SVL.

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
# Username should be "token" and password will be the API key you genereate
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
