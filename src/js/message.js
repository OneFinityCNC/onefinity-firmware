/******************************************************************************\

                 This file is part of the Buildbotics firmware.

                   Copyright (c) 2015 - 2018, Buildbotics LLC
                              All rights reserved.

      This file ("the software") is free software: you can redistribute it
      and/or modify it under the terms of the GNU General Public License,
       version 2 as published by the Free Software Foundation. You should
       have received a copy of the GNU General Public License, version 2
      along with the software. If not, see <http://www.gnu.org/licenses/>.

      The software is distributed in the hope that it will be useful, but
           WITHOUT ANY WARRANTY; without even the implied warranty of
       MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
                Lesser General Public License for more details.

        You should have received a copy of the GNU Lesser General Public
                 License along with the software.  If not, see
                        <http://www.gnu.org/licenses/>.

                 For information regarding this software email:
                   "Joseph Coffland" <joseph@buildbotics.com>

\******************************************************************************/

'use strict'


module.exports = {
  template: '#message-template',

  props: {
    show: {
      type: Boolean,
      required: true,
      twoWay: true
    },

    class: {
      type: String,
      required: false,
      twoWay: false
    },

    click_away_close: {
      type: Boolean,
      default: true
    },

    width: {
      type: String,
      default: ''
    }
  },

  events: {
    'click-away': function () {if (this.click_away_close) this.show = false}
  },


  watch: {
    show: function (show) {if (show) Vue.nextTick(this.focus)}
  },


  methods: {
    click_away: function (e) {
      if (!e.target.classList.contains('modal-wrapper')) return;
      this.$emit('click-away')
    },


    focus: function () {
      $(this.$el).find('[focus]').each(function (index, e) {
        e.focus()
        return false;
      })
    }
  }
}

