module.exports = function () {
  const sessions = new Map()
  return {
    sessions,
    paymentKey: () => 'sk_test_fixture',
    createCheckout: async (id, name, amount) => {
      const checkout = { id: 'cs_' + id, attributes: { checkout_url: 'https://checkout.paymongo.com/' + id, reference_number: id, livemode: false, payments: [{ id: 'pay_' + id, attributes: { status: 'paid', currency: 'PHP', amount: amount * 100, source: { type: 'gcash' } } }] } }
      sessions.set(checkout.id, checkout)
      return checkout
    },
    paymongo: async path => { const id = path.slice(1).replace('/expire', ''); const session = sessions.get(id); if (path.endsWith('/expire')) session.attributes.status = 'expired'; return session },
  }
}
