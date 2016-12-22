var UPDATE=1000 * 5;//ms

function showError(errorMessage) {
  console.error(errorMessage)
  window.modal.open('Error', JSON.stringify(errorMessage, null, 2));
}

function yesNoPrompt(msg, yesCB, noCB) {
  var empty = function() {};
  window.modal.open(msg, false,
    {text:'Yes', action:function() {window.modal.close(); (yesCB||empty)();}},
    {text:'No', action:function() {window.modal.close(); (noCB||empty)();}}
  )
}

var VMain = new Vue({
  el: '#content',
  ready: function() {
    var members = this.$resource('/members');
    var transfers = this.$resource('/transfers');
    var assets = this.$resource('/manifest');
    if (getCookie('signal_key')) {
      var key = getCookie('apikey');
      var t = prompt('Copy this key and save it', key);
      eraseCookie('signal_key');
    };
    this.errorMsg = getParameterByName('error');
    transfers.get().then(function(response) {
      this.transfers = response.json();
    }, showError);
    members.get().then(function(response) {
      this.members = response.json()
    }, showError);
    assets.get().then(function(response) {
      this.assets = response.json();
      var uriParts = location.hash.slice(1).split(':');
      if (uriParts.length == 2) {
        this.activeGroup = uriParts[0];
        this.activeAsset = uriParts[1];
      }
    }, showError);
    this.teamName = getCookie('team');
  },
  methods: {
    toggleAllTransfers: function() {
      this.allTransfers = !this.allTransfers;
      var query = '?all=' + (this.allTransfers ? 'yes' : 'no');
      var transfers = this.$resource('/transfers' + query);
      var that = this;
      transfers.get().then(function(response) {
        Vue.set(that, 'transfers', response.json());
      }, showError);
    },
    offline: function(index) {
      for (var ix in this.assets.offline) {
        if (this.assets.offline[ix][0] == this.assets.legend[index] &&
            this.assets.offline[ix][1] == this.activeGroup) return true;
      }
      return false;
    },
    removeMember: function(member) {
      console.log('Deleting', member);
      var delPromt = 'Are you sure you wish to delete ' + member + ' and ' +
                      'all of their API Keys?';
      var that = this;
      yesNoPrompt(delPromt, function() {
        that.$resource('/members/'+member).remove().then(function(response) {
          Vue.set(that, 'members', response.json());
        }, showError);
      });
    },
    toggleEmailField: function() {
      this.showEmailForm = !this.showEmailForm;
    },
    showVersions: function(group, asset) {
      if (group === this.activeGroup && asset === this.activeAsset) {
        this.activeAsset = null;
        this.activeGroup = null;
        location.hash = '#none';
        return;
      }
      this.activeAsset = asset;
      this.activeGroup = group;
      location.hash = this.activeGroup + ':' + this.activeAsset;
    },
    hideTransfer: function(transferId) {
      this.$resource('/transfers/'+transferId).delete().then(function() {
        window.location.reload();
      }, showError);
    },
    showSumModal: function(version, target) {
        target = this.assets.legend[target];
        var title = 'Checksum <' + this.activeAsset + ':' + version+'>';
        window.modal.open(title, 'Loading... ' + target + ' ' + version);
        var headers = {'X-FOR-REGION':target};
        var service = encodeURIComponent(this.activeGroup);
        var asset = '/meta/'+service+'/'+this.activeAsset+'/'+version;
        this.$http.get(asset, {headers}).then(function(response) {
            window.modal.open(title, response.json().sum);
        }, showError);
    },
    transfer: function(version, destination, deleteAsset) {
      console.log(this.activeGroup, this.activeAsset, version, destination);
      var versions =
        this.assets.assets[this.activeGroup][this.activeAsset][version];
      var source;
      for (var ix in versions) {
        if (versions[ix]) {
          source = ix;
          break;
        }
      }
      if (deleteAsset) {
        source = destination;
        var warn = 'Are you sure you want to delete ' + this.activeAsset +
                   ':' + version + ' from ' + this.assets.legend[source] + '?';
        var t = confirm(warn);
        console.log(source);
        if (!t) return;
      }
      if (source === undefined) {
        alert('This asset is not found in any mirrors. Cannot transfer.');
        return;
      }
      var obj = {
        source: this.assets.legend[source],
        service: this.activeGroup,
        asset: this.activeAsset,
        version: version,
        delete: deleteAsset,
        target: this.assets.legend[destination]
      }
      this.$resource('/transfers').save(obj).then(function(resp) {
        var moreInfo = '/transfers/' + resp.json().transferId + '?format=html';
        var desc;
        if (obj.delete)
          desc = 'Deleting ' + obj.asset + ':' + obj.version +
                 ' from ' + obj.source;
        else
          desc = 'Transfering ' + obj.asset + ':' + obj.version +
                 ' from ' + obj.source + ' to ' + obj.target;
        window.modal.open('New Action Request Submitted', desc,
          {text: 'More Info', action:function() {
            var win = window.open(moreInfo, '_blank');
            win.focus();
          }}
        );
      }, showError);
    },
    deleteteam: function() {
      yesNoPrompt('Are you sure you wish to delete this team?', function() {
        this.$resource('/team').delete().then(function(){
          window.location='/signout'
        }, showError);
      });
    }
  },
  data: {
    teamName: '',
    errorMsg: false,
    transfers: null,
    activeGroup: null,
    activeAsset: null,
    members: [],
    assets: 'init',
    allTransfers: false,
    showEmailForm: false,
    activeAsset: null
  }
});
