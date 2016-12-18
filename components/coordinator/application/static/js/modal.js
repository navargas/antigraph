window.modal = new Vue({
  el: '#modalBox',
  methods: {
    close: function() {
        this.show = false;
    },
    open: function(title, text) {
        this.title = title;
        this.textBox = text;
        this.show = true;
    }
  },
  data: {
    title: "def",
    textBox: "abc",
    show: false
  }
});
