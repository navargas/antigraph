window.modal = new Vue({
  el: '#modalBox',
  methods: {
    close: function() {
      this.show = false;
    },
    open: function() {
      // arguments: title, content, button...
      this.lastOpen = Date.now();
      this.buttons = [];
      this.title = arguments[0];
      this.textBox = arguments[1];
      for (var i=2; i < arguments.length; i++) {
        if (arguments[i] && arguments[i].text)
          this.buttons.push(arguments[i]);
      }
      this.show = true;
    }
  },
  data: {
    title: "def",
    textBox: "abc",
    show: false,
    lastOpen: 0,
    buttons: []
  }
});
