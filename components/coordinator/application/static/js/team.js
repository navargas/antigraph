var UPDATE=1000 * 5;//ms
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
    });
    members.get().then(function(response) {this.members = response.json()});
    assets.get().then(function(response) {
      this.assets = response.json();
      var uriParts = location.hash.slice(1).split(':');
      if (uriParts.length == 2) {
        this.activeGroup = uriParts[0];
        this.activeAsset = uriParts[1];
        console.log('set to', this.activeGroup, this.activeAsset);
      }
    });
    /* Update info every UPDATE seconds */
    /*setInterval(function() {
      assets.get().then(function(response) {
        Vue.set(this.assets, 'items', response.json());
      });
    }, UPDATE);*/
  },
  methods: {
    toggleAllTransfers: function() {
      this.allTransfers = !this.allTransfers;
      var query = '?all=' + (this.allTransfers ? 'yes' : 'no');
      var transfers = this.$resource('/transfers' + query);
      var that = this;
      transfers.get().then(function(response) {
        Vue.set(that, 'transfers', response.json());
      });
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
      var c = confirm('Are you sure you wish to delete ' + member + ' and ' +
                      'all of their API Keys?');
      if (!c) return;
      var that = this;
      this.$resource('/members/'+member).remove().then(function(response) {
        Vue.set(that, 'members', response.json());
      }, function(error) {
        alert(JSON.stringify(error.json()));
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
      });
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
      this.$resource('/transfers').save(obj).then(function() {
        window.location.reload();
      });
    },
    deleteteam: function() {
      var t = confirm('Are you sure you wish to delete this team?');
      if (t) {
        this.$resource('/team').delete().then(function(){window.location='/signout'});
      }
    }
  },
  data: {
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
